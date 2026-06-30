# GX10 本地模型安裝與驗證指南

本文件提供給 GX10 上的 AI / 工程助手照步驟安裝與驗證本地語言模型。這次只處理模型安裝與連線驗證，不修改 DenchClaw 既有的 `wiki`、`loop learning`、`skill`、`reference`、`script`、DB query、EnMS / ERP / Y-CRM routing 或圖表產生邏輯。

DenchClaw 的設計原則是：GX10 只替換 LLM inference layer；既有知識策略、context builder、skill、wiki、playbook、review flow 與 loop learning 都維持原本流程。`gpt-4.1-mini` 先保留作為 primary，並保留在 dropdown 中作為可手動切回的穩定選項；等 GX10 本地模型穩定後，再評估是否移除或改成備援。

## 1. 目前目標

- 在 GX10 上安裝可用於 DenchClaw 的本地模型。
- 確認 Ollama OpenAI-compatible endpoint 可以回應。
- 確認 Hermes endpoint 可以列出或代理這些模型。
- 讓 DenchClaw 之後能透過 dropdown 切換到 GX10 模型。

目前 GX10 連線資訊先以以下設定為準：

```text
GX10 IP: 118.168.188.70
Hermes endpoint: http://118.168.188.70:8642/v1
Hermes API key: hermes_local_secret
Ollama endpoint: http://118.168.188.70:11434/v1
```

## 2. 建議安裝模型

請先在 GX10 上執行以下指令：

```bash
ollama pull qwen3-coder:30b
ollama pull qwen3:30b
ollama pull mistral-small3.2:24b
ollama pull qwen3:14b
```

建議分工如下：

| 模型 | 建議用途 | 備註 |
| --- | --- | --- |
| `qwen3-coder:30b` | SQL、工具呼叫、report-json、程式化回答 | 優先拿來測 DenchClaw 的 DB 查詢與圖表回答 |
| `qwen3:30b` | 中文問答、EnMS / ERP / Y-CRM 分析摘要 | 可作為主要中文推理模型 |
| `mistral-small3.2:24b` | 較快 fallback、demo、一般問答 | 用來避免 30B 回應時間過長 |
| `qwen3:14b` | 快速備援 | 當 30B 太慢時先用這個測流程 |

暫不建議第一階段把 Kimi 當成本地主力。目前已確認 Ollama 上的 Kimi K2.6 是 `kimi-k2.6:cloud`，頁面標示 1.04T parameters，較適合 cloud / 超大型使用型態，不適合作為 GX10 第一階段「本地取代 GPT API 成本」的主力方案。若之後要評估 Kimi K2 / K2.7，請先逐一確認是否有可在 GX10 穩定執行的本地 tag。

## 3. 安裝後檢查

在 GX10 上確認模型已安裝：

```bash
ollama list
```

確認 Ollama OpenAI-compatible endpoint 可以列出模型：

```bash
curl http://127.0.0.1:11434/v1/models
```

如果要從 DenchClaw 這台機器測 GX10，使用：

```bash
curl http://118.168.188.70:11434/v1/models
```

## 4. 測試單一模型

在 GX10 本機測試：

```bash
curl http://127.0.0.1:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3-coder:30b","messages":[{"role":"user","content":"請用一句話回答：你可以協助產生 SQL 嗎？"}],"max_tokens":128}'
```

從 DenchClaw 這台機器測 GX10：

```bash
curl http://118.168.188.70:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3-coder:30b","messages":[{"role":"user","content":"請用一句話回答：你可以協助產生 SQL 嗎？"}],"max_tokens":128}'
```

預期結果：

- HTTP status 為 200。
- 回應內容為中文短句。
- 若回應超過 60 秒，先改測 `qwen3:14b` 或 `mistral-small3.2:24b`。

## 5. 測試 Hermes Endpoint

目前 DenchClaw 已有 Hermes provider 設定，請確認 Hermes 可以列出模型：

```bash
curl http://118.168.188.70:8642/v1/models \
  -H "Authorization: Bearer hermes_local_secret"
```

再測 Hermes chat completion：

```bash
curl http://118.168.188.70:8642/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer hermes_local_secret" \
  -d '{"model":"qwen3:30b","messages":[{"role":"user","content":"請用一句話回答：Hermes 可以呼叫 GX10 本地模型嗎？"}],"max_tokens":128}'
```

如果 `/v1/models` 沒有列出新模型，但 chat completion 可以用指定 model 回答，表示 Hermes 可能支援直通模型但 registry 尚未同步。這種情況先記錄下來，不需要修改 DenchClaw 的 skill / wiki / routing。

如果 Hermes 不能呼叫新模型，請先在 GX10 / Hermes 端更新 model registry 或 routing 設定，讓 Hermes 能代理：

- `qwen3-coder:30b`
- `qwen3:30b`
- `mistral-small3.2:24b`
- `qwen3:14b`

## 6. DenchClaw 直接連 Ollama 的備援方案

若 Hermes 暫時無法穩定代理 Ollama，可以先讓 DenchClaw 直接連 GX10 Ollama endpoint。建議 provider 名稱使用 `gx10_ollama`，base URL 使用：

```text
http://118.168.188.70:11434/v1
```

建議模型清單：

```json
{
  "gx10_ollama": {
    "baseUrl": "http://118.168.188.70:11434/v1",
    "apiKey": "ollama",
    "api": "openai-completions",
    "models": [
      {
        "id": "qwen3-coder:30b",
        "name": "GX10 Qwen3 Coder 30B",
        "contextWindow": 120000,
        "maxTokens": 8192
      },
      {
        "id": "qwen3:30b",
        "name": "GX10 Qwen3 30B",
        "contextWindow": 120000,
        "maxTokens": 8192
      },
      {
        "id": "mistral-small3.2:24b",
        "name": "GX10 Mistral Small 3.2 24B",
        "contextWindow": 32000,
        "maxTokens": 8192
      },
      {
        "id": "qwen3:14b",
        "name": "GX10 Qwen3 14B",
        "contextWindow": 64000,
        "maxTokens": 8192
      }
    ]
  }
}
```

注意：這是備援設定方向，不是要求立即改 DenchClaw。優先順序仍是先讓 Hermes 穩定代理 GX10 模型。

## 7. DenchClaw 驗收方式

模型安裝完成後，回到 DenchClaw：

1. 開啟 chat 頁面。
2. 在 Language Model dropdown 確認可以看到 GX10 模型。
3. 先用 `gpt-4.1-mini` 問同一題，確認原本流程正常。
4. 切到 GX10 模型後問同一題，確認回答有回來。
5. 測試 EnMS DB 問題時，應符合原本原則：
   - 能管問題優先查 EnMS DB。
   - DB 有資料就只用 DB 回答。
   - DB 沒資料就明講缺資料。
   - 真的需要外部背景才標明使用外部資訊。

建議測試問題：

```text
目前系統中有幾個電表？請用表格列出。
```

```text
請統計電號 04043717102 目前有多少筆需量告警紀錄。
```

```text
請用 EnMS 資料分析最近 7 天最大需量與契約容量風險，並提供降載建議。
```

```text
請把目前 EnMS 的電表資料用圖表呈現。
```

## 8. 判斷是否可取代 GPT-4.1-mini

第一階段不要直接移除 `gpt-4.1-mini`，也不要假設已經有自動 fallback。請先把它保留在 dropdown，作為人工切回的穩定選項，並觀察以下指標：

- 一般問答是否能在 10 到 20 秒內完成。
- EnMS DB 查詢是否能正確走工具與資料表。
- report-json / 圖表回答是否穩定。
- 是否會把 EnMS 問題回答成 ERP / Y-CRM。
- 是否會在 DB 有資料時跑去講外部網路資訊。

若 GX10 模型連續通過 demo 問題與日常問題，再把預設模型從 `gpt-4.1-mini` 改成本地模型；否則先保持 GPT 為 fallback。

## 9. 參考來源

- Ollama `qwen3-coder:30b`：30B total / 3.3B activated，偏 agentic coding 與 long context。  
  https://ollama.com/library/qwen3-coder:30b
- Ollama `qwen3:30b`：Qwen 3 30B model。  
  https://ollama.com/library/qwen3:30b
- Ollama `mistral-small3.2:24b`：改善 function calling、instruction following、重複輸出。  
  https://ollama.com/library/mistral-small3.2:24b
- Ollama Kimi K2.6：目前不列為第一階段本地主力。  
  https://ollama.com/library/kimi-k2.6
