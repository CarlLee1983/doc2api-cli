# doc2api v0.3.0 設計：分類品質提升 + Watch 模式

## 概述

三項改進，提升 doc2api 作為 AI Agent 中間層工具的輸出品質與開發體驗：

1. **結構化 extractContent** — 每種分類提取對應結構化資料
2. **上下文感知分類** — 後處理層利用前後 chunk 關係修正分類
3. **Watch 模式** — 監聽檔案變化自動重跑 pipeline

## 設計原則

- 工具本身不內建 LLM，定位為 AI Agent 的中間層
- 規則引擎改進優先，結構化輸出減少下游負擔
- Watch 模式服務 AI Agent 迭代工作流

---

## 功能一：結構化 extractContent

### 現狀

`extractContent()` 只處理 `endpoint_definition`（提取 method + path 字串），其餘 5 種類型回傳 `null`。下游 AI Agent 須自行從 `raw_text` 解析。

### 設計

每種 ChunkType 定義對應的結構化 content 型別：

```typescript
interface EndpointContent {
  readonly method: string
  readonly path: string
  readonly summary: string | null
}

interface ParameterContent {
  readonly parameters: readonly {
    readonly name: string
    readonly type: string | null
    readonly required: boolean | null
    readonly description: string | null
  }[]
}

interface ResponseContent {
  readonly statusCode: number | null
  readonly body: string | null
}

interface AuthContent {
  readonly scheme: string | null   // bearer, apiKey, oauth2
  readonly location: string | null // header, query
  readonly description: string
}

interface ErrorCodesContent {
  readonly codes: readonly {
    readonly status: number
    readonly message: string | null
  }[]
}

type ChunkContent =
  | EndpointContent
  | ParameterContent
  | ResponseContent
  | AuthContent
  | ErrorCodesContent
```

### 提取邏輯

每種 type 各有一個 extractor 函式，從 `raw_text` + `table` 中用 regex / table parsing 提取：

- `endpoint_definition` → 從 regex match 提取 method、path，周圍文字作為 summary
- `parameter_table` → 從 table headers 對應 name/type/required/description 欄位
- `response_example` → 提取 status code（如有）和 JSON body
- `auth_description` → 識別 scheme 類型、location、擷取描述文字
- `error_codes` → 從 table rows 提取 status + message 對
- `general_text` → content 保持 `null`

### 影響

- `Chunk.content` 型別從 `string | null` 改為 `ChunkContent | null`
- **Breaking change**，需 bump minor version（0.2.0 → 0.3.0）

### 檔案變更

- 修改：`src/types/chunk.ts`（新增 content 型別）
- 修改：`src/pipeline/classify.ts`（擴充 extractContent）
- 新增測試：`tests/pipeline/classify.test.ts`（每種 extractor 的測試）

---

## 功能二：上下文感知分類

### 現狀

每個 chunk 獨立分類，不知道前後文。導致：
- endpoint 後面的 JSON block 只拿 0.6 分，可能被歸為 `general_text`
- endpoint 後面的表格如果 header 不夠明確，不會被識別為 parameter_table
- auth 區段的延伸說明容易被遺漏

### 設計

在現有規則引擎之後加一層 `contextRefine` 後處理：

```
classifyChunks(raw) → 獨立打分 → contextRefine(chunks) → 最終結果
```

### 上下文規則（初始集）

| 規則 | 條件 | 調整 |
|------|------|------|
| JSON 跟隨 endpoint | 前一個 chunk 是 `endpoint_definition`，當前是 `general_text` 且含 JSON block | 提升為 `response_example`，信心 0.75 |
| 表格跟隨 endpoint | 前一個 chunk 是 `endpoint_definition`，當前有 table 但被歸為 `general_text` | 提升為 `parameter_table`，信心 0.7 |
| auth 區域延伸 | 前一個 chunk 是 `auth_description`，當前是 `general_text` 且含 token/key/secret 關鍵字 | 提升為 `auth_description`，信心 0.65 |
| 低信心確認 | 當前 chunk 信心 < 0.5，但前後 chunk 都是 endpoint 相關類型 | 保留原分類但信心 +0.1 |

### 設計原則

- **不降級**：contextRefine 只提升分類，不會把已有高信心的結果改掉
- **Pure function**：接收 `readonly Chunk[]`，回傳新的 `readonly Chunk[]`
- **規則可擴充**：每條規則是獨立物件，未來可輕鬆新增
- **非侵入式**：不修改 `classify.ts`，上下文邏輯獨立一層
- **重新提取**：當 contextRefine 提升了 chunk 的分類時，需重新執行 extractContent 以產出對應的結構化 content

### 檔案變更

- 新增：`src/pipeline/context-refine.ts`
- 修改：pipeline 呼叫處（inspect command），在 classifyChunks 後串接 contextRefine
- 新增測試：`tests/pipeline/context-refine.test.ts`

---

## 功能三：Watch 模式

### 指令

```bash
doc2api watch <source> [options]
```

### 選項

| Flag | 預設 | 說明 |
|------|------|------|
| `--output, -o <dir>` | `.` | 輸出目錄 |
| `--verbose` | `false` | 詳細模式：完整 JSON 輸出 |
| `--debounce <ms>` | `300` | 防抖延遲 |
| `--pages <range>` | 全部 | PDF 頁面範圍 |

### 監聽邏輯

```
啟動後：
1. 立即執行一次完整 pipeline
2. 監聽 source 檔案（PDF/HTML/URL list）→ 變化時重跑 inspect
3. 監聽 output 目錄下的 *.json → 變化時重跑 assemble + validate
4. 忽略自身產出的寫入事件（防無限迴圈）
```

### 輸出行為

- **安靜模式（預設）**：`[12:03:45] ✓ inspect 完成 — 12 chunks (3 endpoints, 2 params, 1 auth)`
- **詳細模式（--verbose）**：完整 JSON 輸出到 stdout

### 檔案產出

- inspect 結果 → `<output>/chunks.json`
- assemble 結果 → `<output>/spec.json`
- validate 結果 → 只在終端顯示

### 防無限迴圈

維護 `selfWrittenFiles: Set<string>`，寫入檔案時記錄路徑 + 時間戳，收到 watch 事件時過濾掉 500ms 內自己寫的檔案。

### 退出

`Ctrl+C` 優雅退出，清理 watcher。

### 檔案變更

- 新增：`src/commands/watch.ts`（指令處理）
- 新增：`src/watcher.ts`（監聽邏輯，獨立於指令）
- 修改：`src/index.ts`（註冊 watch 指令）
- 新增測試：`tests/commands/watch.test.ts`、`tests/watcher.test.ts`

---

## 版本規劃

- 目標版本：**v0.3.0**
- Breaking change：`Chunk.content` 型別變更
- 更新 `src/version.ts`

## 實作順序

1. 結構化 extractContent（型別定義 → extractors → 測試）
2. 上下文感知分類（context-refine → 串接 pipeline → 測試）
3. Watch 模式（watcher → command → CLI 註冊 → 測試）
