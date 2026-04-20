# DenchClaw Y-CRM Phase 1 總驗收檢查清單

> 更新日期：2026-04-19
> 目的：在正式驗收前，用一份可直接照著點、照著看的清單，確認 `Y-CRM phase-1` 已達可封板樣板標準。
> 範圍：`Y-CRM`、`DenchClaw Web`、`/review/ycrm`、`AI Wiki writeback / promotion / review queue`

---

## 1. 驗收判定標準

這次 phase-1 驗收應聚焦四件事：

1. `Y-CRM 主流程是否閉環`
2. `review 是否可操作`
3. `audit 是否可追溯`
4. `AI Wiki 是否可安全寫回`

只要這四條成立，就可以視為：

> `Y-CRM 已達可封板樣板`

---

## 2. 已完成且應驗收的項目

### 2.1 Planner / Context

- `plannerPreflight` 已接入 `POST /api/chat` 前置流程
- 可產生 `intent / route / workspace / warning`
- `plannerContextPack` 已可生成並持久化
- `plannerPreflight` 已明確標示為 `Advisory / heuristic`
- 非 Y-CRM 或不適合持久化的後續 turn，會清掉 stale planner metadata

### 2.2 Learning Loop

- 已形成 `Generate Learning Draft -> Write Wiki Draft Files -> Promote / Keep Current / Force Promote` 基本閉環
- 已有 `minimal evidence` 與 cache reuse guardrails
- 寫回目前仍以 `wiki draft files` 為主，不直接亂改正式系統

### 2.3 Review / Queue

- 已有正式 review route：`/review/ycrm?sessionId=...`
- chat header 可 `Open review`
- sidebar queue row 可 `Go to review`
- queue summary / filters / row badges 已可運作

### 2.4 Governance / Audit

- `promotion / conflict / resolution` 已有 server-side transition guardrails
- 已保存：
  - `reviewer_actor`
  - `review_reason`
  - `reviewer_note`
  - `approved_at / approved_via`
  - `history / timeline`

### 2.5 AI Wiki

- 已接上：
  - `wiki/index.md`
  - `wiki/log.md`
  - `wiki draft files`
  - promotion registry update

---

## 3. UI 驗收動線

### 3.1 首頁 / Chat

先打開：

- `http://118.168.188.27:3200/`

檢查：

- 可以正常進入 chat
- 送一則偏 Y-CRM 的問題後，chat header 會出現：
  - `Advisory`
  - review state
  - `Next: ...`

建議測試訊息：

- `請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景`

### 3.2 Sidebar Queue

在左側 session list 檢查：

- 有 `Review Queue` summary
- 可切：
  - `All`
  - `Draft ready`
  - `Needs review`
  - `Reviewed`
- 有 review 狀態的 session row 會顯示：
  - `Draft ready`
  - `Needs review`
  - `Reviewed`
  - `Promoted`
  - `by:<reviewer>`
  - `Go to review`

### 3.3 正式 Review Workspace

從下列任一路徑進入：

- chat header 的 `Open review`
- sidebar row 的 `Go to review`
- 直接打：`http://118.168.188.27:3200/review/ycrm`

檢查：

- 會進到 `Y-CRM Review Workspace`
- 有 `Review route ready`
- sessionId 可自動帶入或手動載入

### 3.4 Review 操作順序

在同一個 session 依序測：

1. `Generate Learning Draft`
2. `Write Wiki Draft Files`
3. `Promote Wiki Draft Files`

如果發生 conflict，再測：

4. `Keep Current Page`
5. `Force Promote This Draft`

### 3.5 Review 顯示內容

確認頁面上會保留：

- `Review Context`
- `Learning Timeline`
- `Reviewer identity`
- `Review reason`
- `Reviewer note`
- `Review state`
- `Promotion Conflicts`
- `Conflict Compare View`

---

## 4. API 驗收清單

下列 API 應可支撐 phase-1 主流程：

- `POST /api/chat`
- `GET /api/web-sessions/[id]`
- `GET /api/web-sessions?includeAll=true`
- `POST /api/debug/ycrm-learning-draft`
- `POST /api/debug/ycrm-learning-draft/writeback`
- `POST /api/debug/ycrm-learning-draft/promote`
- `POST /api/debug/ycrm-learning-draft/resolve`

驗收時重點不是逐個手打 API，而是確認這些 API 在 UI 路徑下都能支撐：

- planner persistence
- review queue
- learning draft
- writeback
- promotion
- resolution

---

## 5. 文件驗收清單

驗收時應一併檢查這幾份文件已同步到正式 repo：

- [DenchClaw_YCRM_新架構對齊與整合進度.md](/Users/ym/DenchClaw/docs/DenchClaw_YCRM_新架構對齊與整合進度.md)
- [DenchClaw_YCRM_實作封板版_系統架構圖與流程圖.md](/Users/ym/DenchClaw/docs/DenchClaw_YCRM_實作封板版_系統架構圖與流程圖.md)
- [DenchClaw_YCRM_Phase1_封板評估與樣板化結論.md](/Users/ym/DenchClaw/docs/DenchClaw_YCRM_Phase1_封板評估與樣板化結論.md)
- [ycrm-context-builder.md](/Users/ym/DenchClaw/schema/prototype-scorecards/ycrm-context-builder.md)

---

## 6. 可接受的已知限制

以下項目目前存在，但不應判定 phase-1 失敗：

- `/review/ycrm` 已是正式入口，但底層仍重用既有 review/debug 工作區，不是全新獨立頁面
- 目前仍是 `AI API Key` 推理模式，尚未接本地模型
- 目前仍是 `Y-CRM first`，不是完整跨系統 router
- `plannerPreflight` 仍屬 `Advisory / heuristic`，不應被視為正式 truth
- learning loop 目前仍以人工觸發與人工審核為主，不是全自動知識編譯 pipeline
- session persistence 仍屬 phase-1 等級，適合 pilot 與樣板，不代表已完成大型多系統併發治理

---

## 7. 不應再混進 phase-1 的下一階段項目

以下不應在這次驗收時被混成「phase-1 還沒做完」：

- ERP / MES / WMS / EMS 的正式 domain integration
- 多系統 router / model router
- Ollama / Qwen / Gemma / turboQuant / KV Cache 本地模型堆疊
- 自動化 ingest / lint / background learning pipeline
- 更大範圍的 production-grade persistence / concurrency 重構
- 把 review workspace 與 debug utilities 完全拆成兩套獨立產品視圖

---

## 8. 一句話總結

> phase-1 驗收的重點，不是再追新功能，而是確認 `Y-CRM 主流程是否閉環、review 是否可操作、audit 是否可追溯、AI Wiki 是否可安全寫回`。
