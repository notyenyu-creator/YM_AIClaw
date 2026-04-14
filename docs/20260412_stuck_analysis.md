# DenchClaw 卡住問題分析

> 分析日期：2026-04-12
> 分析人：Claude Code（從 Y-CRM 專案側分析 DenchClaw 運行環境）

---

## 一、症狀

用戶反映 DenchClaw「卡住了」— 在 Web Chat 介面對話時，AI 無法回覆。

---

## 二、直接原因：OpenAI API Rate Limit

**gateway.err.log 最新錯誤（2026-04-12 05:08~05:09）：**
```
[agent/embedded] embedded run agent end: isError=true model=gpt-4.1-mini provider=openai
error=⚠️ API rate limit reached. Please try again later.
```
連續 3 次失敗。

**觸發場景：**
- 最近使用的 chat session（`1a4a0e47`）已累積 **26 條訊息、217KB**
- 每次 AI 回覆都要把完整 context 送給 OpenAI → token 數巨大
- gpt-4.1-mini 的 rate limit（RPM/TPM）很快被打到

---

## 三、其他問題（一併排查）

### 問題 1：dench-ai-gateway 插件完全無法載入（P1 — 啟動時就失敗）

**錯誤訊息：**
```
Cannot find module '../shared/dench-auth.js'
Require stack:
- .openclaw-dench/extensions/dench-ai-gateway/composio-bridge.ts
```

**根因：**
- `composio-bridge.ts` 第 2 行 `import { readDenchAuthProfileKey } from "../shared/dench-auth.js"`
- 安裝 plugin 時只把 `dench-ai-gateway/` 目錄複製到 `~/.openclaw-dench/extensions/`
- 但 `shared/dench-auth.ts` 在 `DenchClaw/extensions/shared/`，是兄弟目錄
- 安裝過程沒有把 `shared/` 複製過來 → `../shared/dench-auth.js` 找不到

**結構對照：**
```
DenchClaw/extensions/
├── shared/
│   ├── dench-auth.ts          ← 源碼存在
│   └── composio-search-context.ts
├── dench-ai-gateway/
│   └── composio-bridge.ts     ← import '../shared/dench-auth.js'
└── ...

~/.openclaw-dench/extensions/
├── dench-ai-gateway/          ← 有
│   └── composio-bridge.ts
└── (沒有 shared/ 目錄)        ← 缺失！
```

**影響：**
- Dench AI Gateway（模型路由/proxy）完全不工作
- API call 直接走 OpenAI（不經過 gateway 的負載分散/模型切換）
- 更容易打到單一 provider 的 rate limit

---

### 問題 2：WebSocket 連線頻繁 timeout（P2 — 間歇性）

**gateway.err.log 統計（2026-04-11）：**
- `[ws] handshake timeout` 出現 **20+ 次**
- `[ws] closed before connect` 出現 **15+ 次**
- 密集時段：04:39~07:15, 11:59~15:24

**可能原因：**
- Mac mini 進入待機後網路恢復延遲
- 前端 Next.js (port 3200) 反覆嘗試連接 gateway (port 19001)

---

### 問題 3：auto-schema 只有一個工作區（P2 — 查詢效率）

**現況：**
```
skills/ycrm/reference/
├── auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md  ← Y-CRM（有）
└── (其他工作區都沒有)
```

**影響：**
- IDENTITY.md Step 2 指示 AI `read auto-schema-workspace_<schema>.md`
- 查 Calleen 工作區時 AI 嘗試讀 `auto-schema-workspace_407lopjyyvm7bxeutk1tvqkpo.md` → 404
- AI fallback 讀 Y-CRM 的 schema 來參考（因為大部分標準表相同），但浪費了一個 tool call

---

### 問題 4：Stale config 警告（P3 — 美觀）

```
plugins.entries.exa-search: plugin not found (stale config entry ignored)
plugins.entries.apollo-enrichment: plugin not found (stale config entry ignored)
```

`openclaw.json` → `plugins.entries` 裡 `exa-search` 和 `apollo-enrichment` 設定還在但 plugin 已移除。

---

### 問題 5：版本過時（P3）

```
[gateway] update available (latest): v2026.4.10 (current v2026.3.13)
Run: openclaw --profile dench update
```

---

### 問題 6：Ollama 本地模型只剩一個（P3）

```
ollama 可用模型：gemma4:e2b (7.2GB)
```

openclaw.json 設定了 3 個 Ollama 模型（gemma4:e2b, qwen3.5:4b, qwen3.5:9b），但實際只有 gemma4:e2b 存在。設定與實際不一致，不影響運作（選不到的模型不會被使用），但造成混亂。

---

## 四、修復建議

### 立即恢復（解決卡住）

| 步驟 | 操作 | 說明 |
|------|------|------|
| 1 | 開一個**新 chat session** | 不要繼續 26 條的長對話，context 太大 |
| 2 | 等 1~2 分鐘後重試 | OpenAI rate limit 通常 60 秒內恢復 |
| 3 | 或切模型到 `ollama/gemma4:e2b` | 完全不依賴 OpenAI（但回答品質較差） |

### 短期修復

| 步驟 | 操作 | 說明 |
|------|------|------|
| 4 | 修復 dench-ai-gateway | 把 `DenchClaw/extensions/shared/` 複製到 `~/.openclaw-dench/extensions/shared/`，然後重啟 gateway |
| 5 | 清理 openclaw.json stale entries | 刪除 `plugins.entries.exa-search` 和 `plugins.entries.apollo-enrichment` |
| 6 | 清理 Ollama 不存在的模型設定 | 從 `models.providers.ollama.models` 移除 qwen3.5:4b 和 qwen3.5:9b |
| 7 | 更新 OpenClaw | `openclaw --profile dench update` |

### 中期改善

| 步驟 | 操作 | 說明 |
|------|------|------|
| 8 | 為其他工作區產生 auto-schema | 對每個活躍工作區跑一次 `python3 scripts/scan-schema.py <schema>` |
| 9 | rate limit fallback 策略 | 當 OpenAI rate limit 時自動切到 Ollama（需 gateway 支援） |

---

## 五、系統現況快照

| 項目 | 狀態 |
|------|------|
| Gateway (port 19001) | 運行中 (PID 91913, since 04/09 17:42) |
| Web App (port 3200) | 運行中 (PID 15897) |
| HTTP 200 回應 | Gateway 2.3s / Web 3.0s（偏慢） |
| 預設模型 | `openai/gpt-4.1-mini` |
| Ollama 可用 | `gemma4:e2b` (7.2GB) |
| dench-ai-gateway plugin | ❌ 載入失敗 |
| OpenClaw 版本 | v2026.3.13（最新 v2026.4.10）|
| Chat sessions 總數 | 30+ |
| 最近 session 大小 | 26 msg / 217KB |
