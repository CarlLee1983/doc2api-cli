# doc2api — HTML Source 支援設計規格

## 概述

將 pdf2api 升級為 doc2api，新增 HTML API 文檔作為輸入來源。HTML 文檔經由取得、解析後轉換為與 PDF 相同的 `RawPage[]` 中間格式，下游 pipeline（chunk → classify → assemble）完全重用。

## 設計原則

- **RawPage[] 是唯一的銜接點** — 所有新增程式碼都在 `RawPage[]` 之前，之後的 pipeline 零修改
- **PDF 與 HTML 是平等的 source** — 不是主從關係，共用 strategy pattern
- **Graceful degradation** — Playwright 為 optional dependency，與 pdfplumber 模式一致
- **專用 parser 漸進式增加** — 通用 Markdown 路徑保底，已知框架逐步加入專用 parser

## 範圍

### 包含

- 更名 pdf2api → doc2api（package name、CLI binary、文件引用）
- Extract 層 strategy pattern（`ExtractPdf` / `ExtractHtml`）
- 內容取得層（HTTP fetch + Playwright fallback）
- 解析層（框架偵測 + 專用 parser + 通用 Defuddle fallback）
- 多頁爬取（同域、深度限制、去重）
- `doctor` 命令擴充
- 錯誤碼 `E5xxx` 段

### 不包含

- MCP Server 介面
- Chunk 群組 / 預組裝
- Postman Collection / HAR 匯入
- Programmatic API（`import` 方式使用）

## 架構

### 資料流

```
使用者輸入
  │
  ├─ file.pdf ──────────────────→ ExtractPdf ──┐
  │                                             │
  ├─ https://url ──→ fetch/Playwright ──┐       │
  │                                     │       │
  ├─ https://url --crawl ──→ crawler ───┤       │
  │                         (發現 URLs)  │       │
  ├─ urls.txt ──────────────────────────┤       │
  │                                     ▼       │
  │                              框架偵測        │
  │                     ┌──── 已知 → 專用 parser │
  │                     └── 未知 → Defuddle      │
  │                              │               │
  │                              ▼               │
  │                         ExtractHtml ────────┤
  │                                             │
  │                                        RawPage[]
  │                                             │
  │                                      chunkPages()
  │                                             │
  │                                        RawChunk[]
  │                                             │
  │                                    classifyChunks()
  │                                             │
  │                                         Chunk[]
  │                                             │
  │                                    [AI Agent 語義填補]
  │                                             │
  │                                      AssembleInput
  │                                             │
  │                                   buildOpenApiSpec()
  │                                             │
  │                                      OpenAPI 3.0.3
```

### Extract 層 Strategy Pattern

```typescript
interface ExtractSource {
  readonly type: 'pdf' | 'html'
  extract(): Promise<Result<ExtractResult>>
}
```

來源偵測邏輯（在 `inspect` 命令中）：

- `.pdf` 結尾 → `ExtractPdf`（現有邏輯包裝）
- `http://` / `https://` 開頭 → `ExtractHtml`
- `.txt` 結尾且內容為 URL 清單 → `ExtractHtml` 批次模式

## 內容取得層（Fetcher）

### 分層策略

```
URL → HttpFetcher (fetch)
        │
        ├─ 內容完整 → HTML string
        │
        └─ SPA 偵測觸發 → BrowserFetcher (Playwright) → HTML string
```

### SPA 偵測條件

fetch 取得 HTML 後，任一條件成立即升級到 Playwright：

- `<body>` 內文字量 < 200 字元（排除 script/style 標籤內容）
- 存在 `<div id="root"></div>` 或 `<div id="app"></div>` 空容器
- 存在 `<noscript>` 標籤提示需要 JavaScript

### Playwright Graceful Degradation

- Playwright 為 optional dependency
- 未安裝時：SPA 頁面回傳 `E5002` 錯誤 + 安裝建議；靜態頁面正常處理
- 與 pdfplumber 的 degradation 模式一致

## 解析層（Parser）

### 統一介面

```typescript
interface HtmlParser {
  readonly name: string
  detect(html: string): boolean
  parse(html: string, url: string): RawPage[]
}
```

### 框架偵測

遍歷已註冊的 parser，第一個 `detect() === true` 的勝出，否則 fallback 到通用 parser。

| 框架 | 偵測特徵 |
|------|----------|
| ReadMe.io | `<meta name="generator" content="readme">` 或 `.rm-Article` class |
| Docusaurus | `<meta name="generator" content="Docusaurus">` |
| Slate | `.tocify-wrapper` + 三欄結構 |
| GitBook | `<meta name="generator" content="GitBook">` |
| Redoc | `.redoc-wrap` 或 `<redoc>` tag |

初期實作：通用 parser + 一個專用 parser（ReadMe.io）作為示範。其餘框架後續漸進式增加。

### 專用 Parser 職責

從 DOM 結構直接提取：

- Endpoint method + path
- Parameter table → 保留為 `Table` 型別（headers + rows）
- Response example → code block 內容
- Auth 描述

輸出結構化的 `RawPage[]`，tables 欄位填入真正的表格資料。

### 通用 Parser（Fallback）

1. 用 Defuddle 清除 nav/sidebar/footer 雜訊，轉出乾淨 Markdown
2. Markdown 塞入 `RawPage.text`
3. HTML `<table>` 用 Cheerio 獨立提取為 `Table` 結構，不依賴 Markdown 轉換
4. 單頁文檔 → 一個 `RawPage`；多頁 → 每個 URL 一個 `RawPage`，`pageNumber` 按抓取順序編號

## 多頁爬取

### 觸發方式

- 入口 URL + `--crawl` flag
- 或提供 `.txt` URL 清單檔（不爬取，直接使用清單）

### 過濾規則

| 規則 | 說明 |
|------|------|
| 同域限制 | 只跟進與入口 URL 同 hostname 的連結 |
| 路徑前綴 | 只跟進與入口 URL 同路徑前綴的連結（如 `/docs/*`）|
| 深度限制 | `--max-depth N`，預設 2 |
| URL 去重 | normalize 後去重（移除 fragment、統一 trailing slash）|
| 排除模式 | 自動排除 `#`、`javascript:`、登入/註冊頁、靜態資源（`.css`、`.js`、`.png`）|
| 並行控制 | 最多 3 個同時請求 |
| 總量上限 | `--max-pages N`，預設 50 |

### 透明度

inspect 輸出中包含已抓取的 URL 清單，每個 URL 對應一個 `pageNumber`。

## CLI 變更

### 更名

- Binary：`pdf2api` → `doc2api`
- Package name：`pdf2api` → `doc2api`

### inspect 命令擴展

```
doc2api inspect <source>                                    # 自動偵測 PDF/URL
doc2api inspect https://api.example.com/docs                # 單頁 HTML
doc2api inspect https://api.example.com/docs --crawl        # 多頁爬取
doc2api inspect urls.txt                                    # URL 清單
doc2api inspect file.pdf                                    # PDF（現有行為）
```

### 新增 flags

| Flag | 說明 | 預設值 |
|------|------|--------|
| `--crawl` | 啟用多頁爬取 | 關閉 |
| `--max-depth N` | 爬取深度限制 | 2 |
| `--max-pages N` | 最大頁面數 | 50 |
| `--browser` | 強制使用 Playwright | 關閉 |

### doctor 命令擴充

```
doc2api doctor

  Bun v1.x             ✓
  Python 3.x           ✓
  pdfplumber            ✓  PDF 表格提取
  cheerio               ✓  HTML 解析
  defuddle              ✓  HTML 清理
  playwright            ⚠  未安裝（SPA 渲染需要，執行 bunx playwright install）
```

## 依賴管理

### 必要依賴（dependencies）

- `cheerio` — HTML DOM 解析、CSS selector 提取
- `defuddle` — HTML → Markdown 清理

### 可選依賴（optional）

| 依賴 | 用途 | 未安裝時 |
|------|------|---------|
| `playwright` | SPA 渲染 | 靜態頁面正常，SPA 回傳 `E5002` + 安裝建議 |
| `pdfplumber` (Python) | PDF 表格提取 | 現有行為不變 |

## 錯誤碼

新增 `E5xxx` 段：

| 碼 | 類型 | 說明 |
|----|------|------|
| `E5001` | `FETCH_FAILED` | HTTP 請求失敗（網路錯誤、404、timeout） |
| `E5002` | `BROWSER_REQUIRED` | 偵測到 SPA 但 Playwright 未安裝 |
| `E5003` | `CRAWL_FAILED` | 爬取過程中發生錯誤 |
| `E5004` | `PARSE_FAILED` | HTML 解析失敗 |
| `E5005` | `NO_CONTENT` | 頁面無可用內容 |

## 新增檔案

```
src/pipeline/extract-html.ts          # ExtractHtml 主進入點
src/pipeline/fetcher/
  ├─ http-fetcher.ts                  # fetch 取得
  ├─ browser-fetcher.ts               # Playwright（optional）
  └─ crawler.ts                       # 多頁發現 + 去重 + 深度控制
src/pipeline/parser/
  ├─ types.ts                         # HtmlParser 介面
  ├─ detect.ts                        # 框架偵測 + parser 路由
  ├─ generic-parser.ts                # Defuddle → Markdown fallback
  └─ readme-parser.ts                 # ReadMe.io 專用（示範）
```

## 測試策略

```
tests/pipeline/extract-html.test.ts   # 整合測試：URL → RawPage[]
tests/pipeline/fetcher/               # 各 fetcher 單元測試
tests/pipeline/parser/                # 各 parser 單元測試 + 框架偵測
tests/fixtures/html/                  # 各框架的 HTML 範例檔案
```

- 使用本地 HTML fixture 測試 parser，不依賴外部網路
- Fetcher 層用 mock server 測試
- Crawler 用 mock 連結結構測試深度與去重邏輯
