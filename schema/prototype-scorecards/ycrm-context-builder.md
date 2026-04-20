# Y-CRM Context Builder Prototype Scorecard v0.1

> 狀態：初始骨架
> 更新日期：2026-04-16
> 類型：文件驅動 prototype scorecard
> 對應文件：
> - `schema/prototype-contracts/ycrm-context-builder.md`
> - `schema/prototype-test-cases/ycrm-context-builder.md`

## 1. 目的

這份 scorecard 是用來追蹤 `Y-CRM context builder prototype` 目前做到什麼程度。

它不是新的規格，而是把前面已經定義好的 contract 與 test cases，轉成一份可持續更新的驗收表，讓我們可以清楚看到：

- 哪些案例已通過
- 哪些案例還沒做
- 哪些 guardrails 已守住
- 哪些風險還沒被壓住

初版先用手動評分方式維護，等真正的 prototype 程式骨架出來後，再考慮自動化。

---

## 2. 評分規則

每個 test case 使用以下狀態：

- `pass`：關鍵 assertions 全部通過
- `partial`：主要方向正確，但仍有缺欄位、漏 warning 或邊界不穩
- `fail`：關鍵 assertions 不符，或發生 silent failure
- `not_run`：尚未驗證

### 補充欄位

- `owner`：目前先留空
- `last_checked`：驗證日期
- `notes`：記錄失敗原因、缺口、下一步

---

## 3. 當前總覽

目前狀態：

- Prototype contract：已完成
- Prototype test cases：已完成
- Prototype implementation：已建立最小純函式骨架
- Prototype debug route：已建立並完成測試
- Scorecard：已完成第一次正式跑分

首輪驗證結果：

- 測試日期：2026-04-16
- 測試檔：`apps/web/lib/ycrm-context-builder.test.ts`
- 結果：`10 / 10 pass`

Debug route 驗證結果：

- 測試日期：2026-04-16
- 測試檔：`app/api/debug/ycrm-context-builder/route.test.ts`
- 結果：`5 / 5 pass`

Debug page 里程碑：

- 已建立頁面：`app/debug/ycrm-context-builder/page.tsx`
- 目標：不打 API 工具，也能在 DenchClaw Web 內直接查看 context plan

Debug page 驗證結果：

- 測試日期：2026-04-17
- 測試檔：`app/debug/ycrm-context-builder/page.test.tsx`
- 結果：`2 / 2 pass`

Chat preflight 里程碑：

- 已接入：`app/api/chat/route.ts`
- 行為：聊天送出前先計算 Y-CRM planner preflight
- 效果：
  - 若判定應先走 Y-CRM，會將精簡 planner preflight 注入 agent message
  - 會將 planner 摘要寫入 web session metadata，作為後續 planner / debug 依據

Chat preflight 驗證結果：

- 測試日期：2026-04-17
- 測試檔：`app/api/chat/chat.test.ts`
- 結果：`23 / 23 pass`

Session visibility 里程碑：

- 已擴充：`app/api/web-sessions/[id]/route.ts`
- 行為：讀取聊天 session 時會一併回傳 session metadata 與最新 `plannerPreflight`
- 已擴充：`app/debug/ycrm-context-builder/page.tsx`
- 效果：
  - 可用 web session ID 直接讀回真正寫入 metadata 的 planner preflight
  - 不只看 builder 模擬結果，也能對照實際 chat 前置判斷

Session visibility 驗證結果：

- 測試日期：2026-04-17
- 測試檔：
  - `app/api/web-sessions/web-sessions.test.ts`
  - `app/debug/ycrm-context-builder/page.test.tsx`
  - `app/api/chat/chat.test.ts`
- 結果：`41 / 41 pass`

Session sidebar 里程碑：

- 已擴充：`app/components/workspace/chat-sessions-sidebar.tsx`
- 行為：在聊天 session row 顯示精簡 planner preflight badge
- 效果：
  - 可直接看見該 session 是否已被路由到 `Y-CRM`
  - 可直接看見是否為 `cross-system`
  - 可直接看見目前抓到的 `workspace` 提示

Session sidebar 驗證結果：

- 測試日期：2026-04-17
- 測試檔：
  - `app/components/workspace/chat-sessions-sidebar.test.tsx`
  - `app/api/web-sessions/web-sessions.test.ts`
  - `app/api/chat/chat.test.ts`
- 結果：`40 / 40 pass`

Chat panel header 里程碑：

- 已擴充：`app/components/chat-panel.tsx`
- 行為：在目前對話 header 顯示最新 planner preflight 狀態列
- 效果：
  - 進到對話內頁時可直接看到 `Y-CRM / intent / confidence / cross-system / workspace`
  - 若 preflight 有 warning 或 blocker，也能在 header 直接看見提示
  - 不只 sidebar 有狀態，chat 內頁也能看到目前 routing 狀態

Chat panel header UI 驗證結果：

- 測試日期：2026-04-17
- 測試檔：
  - `app/components/planner-preflight-header.test.tsx`
- 結果：`2 / 2 pass`

Y-CRM context pack 里程碑：

- 已建立：`lib/ycrm-context-pack.ts`
- 行為：把 `buildYcrmContext()` 的判斷結果整理成可重用的 context pack
- 效果：
  - chat 前置不再只注入簡化 preflight 摘要
  - 會帶入 `read_first / wiki / playbooks / memory / live_query_steps / execution_hints`
  - 小模型收到的上下文更接近真正可執行的前置封包

Y-CRM context pack 驗證結果：

- 測試日期：2026-04-17
- 測試檔：
  - `lib/ycrm-context-builder.test.ts`
  - `lib/ycrm-context-pack.test.ts`
  - `app/api/chat/chat.test.ts`
- 結果：`35 / 35 pass`

Session context pack visibility 里程碑：

- 已擴充：`app/api/web-sessions/shared.ts`
- 行為：將 `plannerContextPack` 與 `plannerPreflight` 一起寫入 session metadata
- 已擴充：`app/debug/ycrm-context-builder/page.tsx`
- 效果：
  - 可直接用 web session ID 讀回真正注入過的 `Y-CRM Context Pack`
  - 能看見 `read_first / live_query_steps / execution_hints / memory_keys`
  - debug page 不只顯示 summary，還能顯示實際存檔的前置上下文封包

Session context pack visibility 驗證結果：

- 測試日期：2026-04-17
- 測試檔：
  - `app/api/chat/chat.test.ts`
  - `app/api/web-sessions/web-sessions.test.ts`
  - `app/debug/ycrm-context-builder/page.test.tsx`
- 結果：`41 / 41 pass`

Y-CRM learning draft 里程碑：

- 已建立：`lib/ycrm-learning-draft.ts`
- 行為：根據已持久化的 `plannerPreflight + plannerContextPack + session messages` 產生第一版 learning draft
- 已建立：`app/api/debug/ycrm-learning-draft/route.ts`
- 效果：
  - 可以安全地先產生 `wiki / playbook / memory` 草稿
  - 不直接自動寫回，先讓人檢視 draft 品質
  - 後續可自然延伸成 learning loop 的 `auto-draft -> approve -> write-back`

Y-CRM learning draft 驗證結果：

- 測試日期：2026-04-18
- 測試檔：
  - `lib/ycrm-learning-draft.test.ts`
  - `app/api/debug/ycrm-learning-draft/route.test.ts`
  - `app/debug/ycrm-context-builder/page.test.tsx`
- 結果：learning draft 相關流程通過，並與現有 debug page 整合完成

Persisted learning draft visibility 里程碑：

- 已擴充：`app/api/web-sessions/shared.ts`
- 行為：將 `plannerLearningDraft` 與 `plannerPreflight / plannerContextPack` 一起寫入 session metadata
- 已擴充：`app/debug/ycrm-context-builder/page.tsx`
- 效果：
  - 生成過的 learning draft 會保留在 session 上
  - 下次重新載入同一個 session 時，仍可看到最新 learning draft
  - `Generate Learning Draft` 從一次性 debug 操作，提升成可追蹤的 session-level learning artifact

Persisted learning draft visibility 驗證結果：

- 測試日期：2026-04-18
- 測試檔：
  - `app/api/debug/ycrm-learning-draft/route.test.ts`
  - `app/api/web-sessions/web-sessions.test.ts`
  - `app/debug/ycrm-context-builder/page.test.tsx`
- 結果：`24 / 24 pass`

Phase-1 hardening 里程碑：

- 已強化：`app/api/debug/ycrm-learning-draft/promote/route.ts`
  - `reviewer_actor / review_reason` 為必填
  - 一般 promote 與 force promote 改為嚴格狀態檢查
- 已強化：`app/api/debug/ycrm-learning-draft/resolve/route.ts`
  - `keep current` 只允許在 `promotion_conflicted`
  - reviewer 欄位改為必填
- 已強化：`app/api/web-sessions/shared.ts`
  - 新增 stale planner artifact invalidation
- 已強化：`app/api/chat/route.ts`
  - 最新 turn 不再適合持久化 Y-CRM planner 時，會自動清除過期 metadata
- 已強化：`app/components/planner-preflight-header.tsx`
  - 新增 `Open review` 入口
- 已強化：`app/debug/ycrm-context-builder/page.tsx`
  - 支援 `?sessionId=...` 自動載入
  - client 端先驗 reviewer 欄位，提升 user-friendly 與治理一致性

Phase-1 hardening 驗證結果：

- 測試日期：2026-04-18
- 測試檔：
  - `app/api/chat/chat.test.ts`
  - `app/api/debug/ycrm-learning-draft/promote/route.test.ts`
  - `app/api/debug/ycrm-learning-draft/resolve/route.test.ts`
  - `app/debug/ycrm-context-builder/page.test.tsx`
  - `app/components/planner-preflight-header.test.tsx`
  - `app/api/web-sessions/web-sessions.test.ts`
- 結果：`62 / 62 pass`

Phase-1 hardening round 2（planner advisory semantics）：

- 已強化：`app/api/web-sessions/shared.ts`
  - `SessionPlannerPreflight` 新增 `validationState`
- 已強化：`lib/ycrm-context-builder.ts`
  - 新產生的 preflight 會標示為 `heuristic`
- 已強化：`app/components/planner-preflight-header.tsx`
  - chat header 顯示 `Advisory / Validated`
- 已強化：`app/components/workspace/chat-sessions-sidebar.tsx`
  - session list 顯示 `Advisory / Validated`
- 已強化：`app/debug/ycrm-context-builder/page.tsx`
  - debug page 顯示 `Planner state`

Phase-1 hardening round 2 驗證結果：

- 測試日期：2026-04-18
- 測試檔：
  - `app/components/planner-preflight-header.test.tsx`
  - `app/components/workspace/chat-sessions-sidebar.test.tsx`
  - `app/debug/ycrm-context-builder/page.test.tsx`
  - `app/api/chat/chat.test.ts`
- 結果：`39 / 39 pass`

Phase-1 hardening round 3（integration + helper coverage）：

- 已新增：`app/api/chat/chat-session-planner.integration.test.ts`
  - 驗證 chat route 寫入 planner metadata 後，session route 能讀回同一份 persisted 狀態
  - 驗證後續非 Y-CRM turn 會清掉 stale planner metadata
- 已擴充：`lib/ycrm-learning-promotion.test.ts`
  - 新增 `different_source_session` conflict branch
- 已新增：`lib/ycrm-learning-writeback.test.ts`
  - 驗證 writeback markdown render 與 overwrite 行為

Phase-1 hardening round 3 驗證結果：

- 測試日期：2026-04-18
- 測試檔：
  - `app/api/chat/chat-session-planner.integration.test.ts`
  - `lib/ycrm-learning-promotion.test.ts`
  - `lib/ycrm-learning-writeback.test.ts`
- 結果：`7 / 7 pass`

Phase-1 hardening round 4（formal review entry）：

- 已新增：`app/review/ycrm/page.tsx`
  - 提供正式 review route
- 已擴充：`app/components/planner-preflight-header.tsx`
  - `Open review` 連到 `/review/ycrm?sessionId=...`
- 已擴充：`app/debug/ycrm-context-builder/page.tsx`
  - 同一個 review 工作區會依路由切換成較正式的 review 文案與狀態

Phase-1 hardening round 4 驗證結果：

- 測試日期：2026-04-18
- 測試檔：
  - `app/components/planner-preflight-header.test.tsx`
  - `app/debug/ycrm-context-builder/page.test.tsx`
- 結果：`10 / 10 pass`

Phase-1 hardening round 5（queue-level review entry）：

- 已擴充：`app/components/workspace/chat-sessions-sidebar.tsx`
  - 有 review 狀態的 session row 會顯示 `Go to review`
  - 直接導向 `/review/ycrm?sessionId=...`

Phase-1 hardening round 5 驗證結果：

- 測試日期：2026-04-19
- 測試檔：
  - `app/components/workspace/chat-sessions-sidebar.test.tsx`
- 結果：`6 / 6 pass`

Learning draft guardrails + writeback 里程碑：

- 已擴充：`lib/ycrm-learning-draft.ts`
- 行為：
  - learning draft 採 `minimal_evidence` 模式
  - 預設只允許 `manual trigger`
  - 同一個 session 已有 draft 時，會優先回傳 cache hit，而不是重跑一遍
- 已建立：`lib/ycrm-learning-writeback.ts`
- 已建立：`app/api/debug/ycrm-learning-draft/writeback/route.ts`
- 已擴充：`app/debug/ycrm-context-builder/page.tsx`
- 效果：
  - 用 API key 模式時，可先把 learning loop 控制在低 token 成本
  - `Generate Learning Draft` 不會每次都重算整個 session
  - 目前 writeback 只會寫 `wiki/...` markdown 草稿，不觸碰 ERP / CRM / Y-CRM 正式資料
  - debug page 可以直接看見 `Fresh draft / Cache hit / Writeback status / guardrails`

Learning draft guardrails + writeback 驗證結果：

- 測試日期：2026-04-18
- 測試檔：
  - `lib/ycrm-learning-draft.test.ts`
  - `app/api/debug/ycrm-learning-draft/route.test.ts`
  - `app/api/debug/ycrm-learning-draft/writeback/route.test.ts`
  - `app/api/web-sessions/web-sessions.test.ts`
  - `app/debug/ycrm-context-builder/page.test.tsx`
- 結果：`30 / 30 pass`

Learning draft review controls 里程碑：

- 已擴充：`app/debug/ycrm-context-builder/page.tsx`
- 效果：
  - 可明確選擇 `force regenerate`
  - 可明確選擇 `overwrite existing wiki draft files`
  - 可直接看見 `written files / skipped files / draft source / updated time`
  - debug page 更接近真正的 learning review panel，而不只是單次測試頁

Wiki draft promotion 里程碑：

- 已建立：`lib/ycrm-learning-promotion.ts`
- 已建立：`app/api/debug/ycrm-learning-draft/promote/route.ts`
- 已擴充：`app/debug/ycrm-context-builder/page.tsx`
- 效果：
  - 將 `write wiki draft files` 與 `promote into wiki registry` 拆成兩個安全步驟
  - promotion 不搬動正式知識頁，只做 `wiki/index.md` 與 `wiki/log.md` 的正式登記
  - debug page 可直接看見 `promoted files` 與 `registry` 更新結果

Wiki draft promotion 驗證結果：

- 測試日期：2026-04-18
- 測試檔：
  - `lib/ycrm-learning-promotion.test.ts`
  - `app/api/debug/ycrm-learning-draft/promote/route.test.ts`
  - `app/debug/ycrm-context-builder/page.test.tsx`
  - `app/api/debug/ycrm-learning-draft/route.test.ts`
  - `app/api/debug/ycrm-learning-draft/writeback/route.test.ts`
- 結果：`17 / 17 pass`

Promotion approval metadata 里程碑：

- 已擴充：`lib/ycrm-learning-promotion.ts`
- 已擴充：`lib/ycrm-learning-draft.ts`
- 已擴充：`app/debug/ycrm-context-builder/page.tsx`
- 效果：
  - promoted wiki page 本體會寫入 `Promotion Metadata`
  - page 內可追到 `source session / learning focus / generation mode`
  - session draft state 也會保留 `approved_at / approved_via`
  - debug page 可直接看到 promotion 的 approval metadata

Promotion approval metadata 驗證結果：

- 測試日期：2026-04-18
- 測試檔：
  - `lib/ycrm-learning-promotion.test.ts`
  - `app/api/debug/ycrm-learning-draft/promote/route.test.ts`
  - `app/debug/ycrm-context-builder/page.test.tsx`
- 結果：`8 / 8 pass`

Promotion conflict guardrail 里程碑：

- 已擴充：`lib/ycrm-learning-promotion.ts`
- 已擴充：`lib/ycrm-learning-draft.ts`
- 已擴充：`app/debug/ycrm-context-builder/page.tsx`
- 效果：
  - promotion 前會先檢查頁面是否仍然像 generated draft
  - 若頁面疑似已被人工整理，或已被其他 session 升格過，會回傳 `promotion_conflicted`
  - debug page 會用較友善的方式顯示 safety check 與 conflict 區塊，不直接悶著失敗

Promotion conflict guardrail 驗證結果：

- 測試日期：2026-04-18
- 測試檔：
  - `lib/ycrm-learning-promotion.test.ts`
  - `app/api/debug/ycrm-learning-draft/promote/route.test.ts`
  - `app/debug/ycrm-context-builder/page.test.tsx`
- 結果：`10 / 10 pass`

Promotion compare view 里程碑：

- 已擴充：`lib/ycrm-learning-promotion.ts`
- 已擴充：`app/debug/ycrm-context-builder/page.tsx`
- 效果：
  - 衝突不只回傳檔名，還會帶出目前頁面的 `title / excerpt / source session`
  - 同時顯示本次 draft 想 promotion 的 `title / outline`
  - debug page 直接變成比較視圖，讓人工判斷更容易

Promotion compare view 驗證結果：

- 測試日期：2026-04-18
- 測試檔：
  - `lib/ycrm-learning-promotion.test.ts`
  - `app/api/debug/ycrm-learning-draft/promote/route.test.ts`
  - `app/debug/ycrm-context-builder/page.test.tsx`
- 結果：`10 / 10 pass`

Promotion resolution actions 里程碑：

- 已擴充：`app/api/debug/ycrm-learning-draft/promote/route.ts`
- 已建立：`app/api/debug/ycrm-learning-draft/resolve/route.ts`
- 已擴充：`app/debug/ycrm-context-builder/page.tsx`
- 效果：
  - compare view 不再只是看資料，已可直接執行 `Keep Current Page`
  - 若使用者明確決定 override，也可執行 `Force Promote This Draft`
  - session draft 會保留 `resolution_action / resolved_at`

Promotion resolution actions 驗證結果：

- 測試日期：2026-04-18
- 測試檔：
  - `app/api/debug/ycrm-learning-draft/promote/route.test.ts`
  - `app/api/debug/ycrm-learning-draft/resolve/route.test.ts`
  - `app/debug/ycrm-context-builder/page.test.tsx`
- 結果：`12 / 12 pass`

目前整體驗證結果：

- 測試日期：2026-04-17
- 測試檔：
  - `lib/ycrm-context-builder.test.ts`
  - `app/api/debug/ycrm-context-builder/route.test.ts`
  - `app/debug/ycrm-context-builder/page.test.tsx`
  - `app/api/chat/chat.test.ts`
  - `app/components/planner-preflight-header.test.tsx`
- 結果：`43 / 43 pass`（前一輪 UI 可見化驗證）

---

## 4. Case Scorecard

| Test Case | 類型 | 狀態 | Last Checked | Notes |
|-----------|------|------|--------------|-------|
| `TC-01` | Product Help | `pass` | 2026-04-16 | 不打 DB，正確落在 `product_help` |
| `TC-02` | Entity Summary With Person Name | `pass` | 2026-04-16 | 正確處理人名 / workspace 混淆與 member lookup |
| `TC-03` | Sales Report With Chart | `pass` | 2026-04-16 | 正確標記 `VALUES` 與 `workspaceMember` |
| `TC-04` | LINE Interaction Review | `pass` | 2026-04-16 | 正確路由 LINE 類問題並帶入 wiki |
| `TC-05` | Cross-System Escalation | `pass` | 2026-04-16 | 正確建立 `erp / wms / mes` handoff |
| `TC-06` | Low-Risk Write Intent | `pass` | 2026-04-16 | 正確標記 `rest_write_required` 與 `readback_required` |
| `TC-07` | Workspace Unresolved | `pass` | 2026-04-16 | 正確留下 unresolved warning |
| `TC-08` | Auto-Schema Missing | `pass` | 2026-04-16 | 正確建立 `auto_schema_missing` blocker |
| `TC-09` | Unknown Intent | `pass` | 2026-04-16 | 避免亂路由到 Y-CRM |
| `TC-10` | Missing Wiki Falls Back Cleanly | `pass` | 2026-04-16 | 缺 wiki 時正確 fallback 到 live query |

---

## 5. Capability Scorecard

除了逐題評分，也需要看能力面是否穩定。

| 能力 | 目標 | 當前狀態 | Notes |
|------|------|----------|-------|
| Route to Y-CRM | 正確判斷是否先進 Y-CRM | `pass` | 已通過首輪 10 題驗證 |
| Intent Classification | 7 種 intent 穩定分類 | `pass` | 目前測試涵蓋已使用 intent |
| Workspace Resolution | 避免 workspace / 人名混淆 | `pass` | `TC-02`, `TC-07` 已覆蓋 |
| Auto-Schema Flagging | 需要真實資料時正確標記 | `pass` | `TC-02` ~ `TC-08` 已覆蓋 |
| WorkspaceMember Lookup | 查人名時正確標記 FK 路徑 | `pass` | `TC-02`, `TC-03` 已覆蓋 |
| Chart Guardrail | 圖表任務強制 `VALUES` | `pass` | `TC-03` 已覆蓋 |
| Write Safety | 低風險寫入仍要求回讀 | `pass` | `TC-06` 已覆蓋 |
| Cross-System Handoff | 該升級時正確升級 | `pass` | `TC-05` 已覆蓋 |
| Warning / Blocker Quality | 不完整狀態能留痕 | `pass` | `TC-07` ~ `TC-10` 已覆蓋 |

---

## 6. 通過門檻

在進入「開始寫最小程式骨架」之後，建議用以下門檻判定是否可以往下一階段走：

### Minimum Gate A

- `TC-01` ~ `TC-06` 至少全部 `pass`
- `TC-07` ~ `TC-10` 不得 `fail`

### Minimum Gate B

以下能力至少應達到 `pass`：

- Route to Y-CRM
- Intent Classification
- Auto-Schema Flagging
- WorkspaceMember Lookup
- Cross-System Handoff

### Minimum Gate C

以下能力至少不能是 `fail`：

- Workspace Resolution
- Chart Guardrail
- Write Safety
- Warning / Blocker Quality

---

## 7. 初版維護方式

在還沒有真正 prototype 程式前，建議這樣維護：

1. 每完成一輪 prototype 設計或實作，就更新一次 scorecard。
2. 每次更新至少標記：
   - 哪些 case 已跑
   - 哪些 case 通過
   - 哪些 case 失敗
   - 失敗原因是規則錯、資料不足，還是實作缺口
3. 不要把 `not_run` 假裝成 `pass`。

---

## 8. 建議的下一步

現在最合理的下一步有兩種：

1. 把純函式骨架接到更上層的 route / UI / debug runner
2. 或開始做第二階段實作
   - 例如補 `prototype runner note`
   - 或把 scorecard 轉成更接近自動化的執行流程

目前進度已往前一步：

- 已建立內部 debug route：`app/api/debug/ycrm-context-builder/route.ts`
- 已建立 debug page：`app/debug/ycrm-context-builder/page.tsx`
- learning loop 目前已可追蹤：
  - `Generate Learning Draft`
  - `Write Wiki Draft Files`
  - `Promote Wiki Draft Files`
  - `Keep Current Page / Force Promote This Draft`
  - `Learning Timeline / resolution history`
  - `Review reason / Reviewer note`
  - `Reviewer identity / approval actor`
  - `Review state badges / timeline filter`
  - `Session-level review queue visibility`
  - `Session-level review queue filter`
  - `Reload persistence verification`
  - `Web-sessions review queue payload verification`
  - `Force promote UI path verification`
  - `User-friendly review guidance states`
  - `Session-level draft-ready queue filter`
  - `Review queue summary visibility`
  - `Chat header review status continuity`
  - `Chat header next-action hint`

下一步我建議聚焦在「更好的人工作業治理」，例如：

1. promotion 後的 reviewer note / comment
2. resolution 的更細緻原因分類
3. 後續 ERP / MES / WMS / EMS 也沿用同一套 audit trail 模式
