# diff 指令設計

> pdf2api 新增 `diff` 指令，比對 inspect 產出的 classified chunks 與最終 OpenAPI spec，列出文件裡有但 spec 裡缺少的 endpoints。作為 Phase 1 → Phase 2 的 gate 條件。

## 指令介面

```
pdf2api diff <inspect.json> <spec.yaml>
```

### Flags

| Flag | 說明 | 預設 |
|------|------|------|
| `--json` | JSON 輸出（給 agent 消費） | `false` |
| `-o, --output <file>` | 寫入檔案 | — |
| `--confidence <0-1>` | endpoint chunk 最低信心閾值 | `0.5` |

### Exit codes

| Code | 意義 |
|------|------|
| `0` | 沒有 missing endpoints（gate pass） |
| `1` | 有 missing endpoints（gate fail） |
| `2` | 輸入錯誤（檔案不存在、格式錯誤等） |

## 核心邏輯

### Step 1 — 從 InspectData 提取 endpoints

遍歷 `chunks[]`，篩選 `type === 'endpoint_definition' && confidence >= threshold`。對每個 endpoint chunk，用既有的 `extractEndpoint()` 取出 `{ method, path }`。提取失敗則跳過該 chunk。

### Step 2 — 收集關聯 chunks

對每個 endpoint chunk，向後掃描到下一個 endpoint chunk 之前，收集 type 為 `parameter_table`、`response_example`、`error_codes`、`auth_description` 的 chunks。記錄 `{ id, type, confidence }`。

### Step 3 — 從 OpenAPI spec 提取 endpoints

解析 YAML/JSON，遍歷 `spec.paths`，對每個 path 的每個 method 組成 `{ method, path }` 集合。

### Step 4 — 集合差

chunks endpoints − spec endpoints = missing endpoints。

### Step 5 — 組裝輸出

每個 missing endpoint 附帶其關聯 chunks 摘要。

## 型別定義

```typescript
// src/types/diff.ts

interface DiffEndpoint {
  readonly method: string
  readonly path: string
  readonly chunkId: string
  readonly confidence: number
  readonly relatedChunks: readonly RelatedChunk[]
}

interface RelatedChunk {
  readonly id: string
  readonly type: ChunkType
  readonly confidence: number
}

interface DiffData {
  readonly summary: {
    readonly totalDocEndpoints: number
    readonly totalSpecEndpoints: number
    readonly missingCount: number
  }
  readonly missing: readonly DiffEndpoint[]
}
```

`runDiff()` 回傳 `Result<DiffData>`。

## Path 正規化

```
normalizePath(path: string): string
```

規則（依序套用）：

1. 移除 trailing slash（`/orders/` → `/orders`，但 `/` 保留）
2. 參數佔位符統一為 `{_}`（`/orders/{id}` → `/orders/{_}`，`:id` → `{_}`）
3. 轉小寫

比對 key：`method.toUpperCase() + ' ' + normalizedPath`

不處理的邊界：

- Query string 差異
- Base path / server URL prefix（`servers[].url` 的 path prefix 不納入比對）

## 錯誤處理

| Code | Type | 情境 |
|------|------|------|
| `E6001` | `INVALID_INSPECT_JSON` | inspect.json 解析失敗或缺少 `chunks` 欄位 |
| `E6002` | `INVALID_SPEC_FILE` | spec 不是合法的 OpenAPI YAML/JSON |
| `E6003` | `NO_ENDPOINTS_FOUND` | chunks 裡完全沒有 endpoint_definition |

`E6003` 不是 fatal — 回傳 `ok()` 但加 warning。檔案層級錯誤沿用 `E3xxx`。

`--confidence` 值必須為 0-1 之間的數字，否則回傳 `E2001`（`INVALID_ARGUMENT`）並附帶 suggestion。

## 輸出格式

### Gate pass（exit 0）

```
✓ All 12 documented endpoints found in spec.
```

### Gate fail（exit 1）

```
Missing endpoints (3 of 15):
  POST /v1/orders        (2 related: parameter_table, response_example)
  DELETE /v1/orders/{id}  (0 related)
  GET /v1/webhooks        (1 related: auth_description)
```

### Warning（exit 0）

```
⚠ No endpoint chunks found — is this the right inspect output?

✓ 0 documented endpoints, 0 missing.
```

`--json` 輸出 `DiffData`，不帶裝飾。`-o` 寫檔時同時在 stdout 印摘要。

## 檔案結構

```
src/
  commands/diff.ts        ← runDiff() 主邏輯
  types/diff.ts           ← DiffData, DiffEndpoint, RelatedChunk
src/index.ts              ← 新增 diff 指令路由
tests/
  commands/diff.test.ts   ← 單元測試
```

## 方案選擇

選用方案 A（純 CLI 指令），不拆 pipeline stage。比對邏輯全在 `src/commands/diff.ts`，與 inspect/assemble/validate 同級。未來需要 programmatic API 時再抽出。

## 比對方向

單向：只比「文件有、spec 沒有」。不比反向（spec 有但文件沒有），避免手動補的 endpoint 造成 false positive。
