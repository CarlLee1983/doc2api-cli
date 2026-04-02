# doc2api 本地開發測試流程 (Development Testing Workflow)

為了確保 `doc2api` 的各項功能（提取、分類、組裝、會話管理）在開發過程中保持穩定，請遵循以下流程進行驗證。

---

## 第一階段：環境驗證 (Environment Check)

在開始測試前，確認本地依賴與工具是否就緒。

```bash
# 檢查 Python (pdfplumber) 與 Playwright (SPA) 環境
bun run src/index.ts doctor
```

---

## 第二階段：直出模式測試 (Direct Pipeline)

驗證單次「提取 -> 組裝 -> 驗證」的完整鏈條。

1.  **PDF 提取 (Inspect)**
    ```bash
    bun run src/index.ts inspect tests/fixtures/simple-api.pdf --json > tmp_inspect.json
    ```
    * 檢查點：`tmp_inspect.json` 中的 `chunks` 是否正確分類，`confidence` 分數是否合理。

2.  **組裝 OpenAPI (Assemble)**
    ```bash
    bun run src/index.ts assemble tmp_inspect.json -o tmp_spec.yaml
    ```
    * 檢查點：`tmp_spec.yaml` 是否包含正確的路徑 (Paths) 與方法 (Methods)。

3.  **驗證 Spec (Validate)**
    ```bash
    bun run src/index.ts validate tmp_spec.yaml
    ```
    * 檢查點：確認 OpenAPI 格式符合 3.0.3 標準。

---

## 第三階段：Session 模式測試 (Session Workflow)

這是針對 AI Agent 或大型文件設計的關鍵流程。

1.  **啟動會話**
    ```bash
    bun run src/index.ts session start tests/fixtures/simple-api.pdf
    ```

2.  **讀取前導資訊**
    ```bash
    doc2api session preamble
    ```

3.  **迭代處理端點 (Endpoint Groups)**
    重複以下步驟直到 `status` 顯示完成：
    ```bash
    # 獲取下一個端點群組
    bun run src/index.ts session next
    
    # 建立臨時提交檔案 (模擬 AI Agent 輸出)
    echo '[{"path": "/test", "method": "GET", "summary": "Test"}]' > tmp_sub.json
    
    # 提交分析結果
    bun run src/index.ts session submit tmp_sub.json
    
    # 查看當前進度
    bun run src/index.ts session status
    ```

4.  **完成並導出**
    ```bash
    bun run src/index.ts session finish -o session_spec.yaml
    ```

---

## 第三點五階段：網站偵察測試 (Scout Command)

在抓取網頁 API 文件前，先偵察網站結構。

1.  **偵察網站**
    ```bash
    bun run src/index.ts scout https://developers-pay.line.me/zh/online-api-v3 --max-depth 1
    ```
    * 檢查點：API 頁面（如付款請求、付款授權）應列在 API 區塊，FAQ 等應列在 Other 區塊。

2.  **儲存 URL 清單**
    ```bash
    bun run src/index.ts scout https://developers-pay.line.me/zh/online-api-v3 --save tmp_urls.txt --max-depth 1
    ```
    * 檢查點：`tmp_urls.txt` 只包含 API 頁面 URL，註解行以 `#` 開頭。

3.  **串接 inspect**
    ```bash
    bun run src/index.ts inspect tmp_urls.txt --json > tmp_inspect.json
    ```
    * 檢查點：`tmp_inspect.json` 的 chunks 應包含完整的 endpoint 定義。

---

## 第四階段：差異比對測試 (Diff Command)

驗證文件更新時的偵測能力。

1.  **手動修改 Spec**：刪除 `session_spec.yaml` 中的某個路徑。
2.  **執行比對**：
    ```bash
    bun run src/index.ts diff tmp_inspect.json session_spec.yaml
    ```
    * 檢查點：是否正確列出「Missing endpoints」，且結束代碼 (Exit Code) 為 1。

---

## 第五階段：自動化與監控

1.  **執行本地 Smoke Test**
    快速驗證 Session 流程代碼是否有邏輯斷層。
    ```bash
    bun test tests/local-smoke.test.ts
    ```

2.  **開發時使用 Watch 模式**
    即時觀察代碼修改對提取結果的影響。
    ```bash
    bun run src/index.ts watch tests/fixtures/simple-api.pdf -o tmp_output/
    ```

---

## 常用故障排除

- **清除所有 Session**：
  若測試狀態異常，執行 `bun run src/index.ts session discard` 或手動刪除 `.doc2api/sessions/` 目錄。
- **強制 JSON 輸出**：
  在任何指令後加上 `--json`，可查看底層完整的 `Result<T>` 結構與錯誤詳細資訊。
