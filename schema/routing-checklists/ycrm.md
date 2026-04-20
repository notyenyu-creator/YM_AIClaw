# Y-CRM Routing Checklist v0.1

> 狀態：初始骨架
> 更新日期：2026-04-16
> 對應文件：
> - `schema/context-builders/ycrm.md`
> - `schema/context-builder-examples/ycrm.md`

## 1. 目的

這份 checklist 是給 DenchClaw 在執行 `Y-CRM first` 路由時使用的最小判斷清單。

它的目標不是補充更多概念，而是把前面的 spec 與 examples 壓縮成一份「可直接照著走」的執行順序，降低：

- 路由判斷飄移
- 上下文抓太多或抓錯
- 跳過關鍵 guardrails
- 太早進入跨系統查詢

---

## 2. 使用方式

每次收到疑似 Y-CRM 任務時，依序檢查下面 7 個區塊。

原則：

1. 先分類，再查資料。
2. 先抓最小上下文包，再決定是否加深。
3. 先確認 Y-CRM 是不是主語義來源，再決定是否要升級到跨系統。
4. 任何需要真實業務資料的回答，都不能跳過 `auto-schema`。

---

## 3. Checklist

### A. 是否應先進 Y-CRM

- [ ] 使用者是否明確提到 `Y-CRM`、客戶、聯絡人、公司、商機、LINE、業務、跟進、拜訪、提案、報價前溝通？
- [ ] 問題主體是否屬於客戶關係、商機背景、業務活動或 LINE 互動？
- [ ] 這題的第一層答案是否應先由 CRM 商業語義提供？

若以上多數為 `是`，先進 Y-CRM 路由。

若以上多數為 `否`，不要硬走 Y-CRM。

### B. 任務分類是否正確

- [ ] 這題是 `product_help` 嗎？
- [ ] 這題是 `entity_summary` 嗎？
- [ ] 這題是 `opportunity_analysis` 嗎？
- [ ] 這題是 `line_interaction_review` 嗎？
- [ ] 這題是 `sales_report` 嗎？
- [ ] 這題是 `write_intent` 嗎？
- [ ] 這題其實是 `cross_system_request` 嗎？

若分類無法明確落點，先保守視為 `entity_summary` 或 `cross_system_request`，不要假裝自己已經知道具體寫法。

### C. 工作區是否解析正確

- [ ] 使用者有沒有明確指定 workspace？
- [ ] 如果只提到 `Y-CRM`，是否已回到預設 workspace：`workspace_3joxkr9ofo5hlxjan164egffx`？
- [ ] 如果題目裡有人名，是否已確認「人名不是 workspace」？
- [ ] 如果是非預設 workspace，是否確認對應 `auto-schema` 存在？

只要工作區還沒穩，先不要進 live query。

### D. 最小規則上下文是否已載入

- [ ] 是否已載入 `skills/ycrm/SKILL.md`？
- [ ] 是否已載入 `schema/integration-profiles/ycrm.md`？
- [ ] 是否依任務類型選了最小必要 reference？

建議對照：

- `product_help` -> `feature-guide.md`
- `sales_report` -> `analysis-templates.md`
- `entity_summary` / `opportunity_analysis` -> `auto-schema`
- `line_interaction_review` -> `feature-guide.md` + `auto-schema`

### E. Wiki / Memory 是否只抓必要部分

- [ ] 是否已有對應客戶頁、商機頁、LINE 互動頁或 playbook？
- [ ] 若有 wiki，是否先抓摘要層，而不是一次整包塞滿？
- [ ] 是否有直接相關的使用者偏好、分析格式偏好、已知踩坑記憶？
- [ ] 若沒有明確相關 memory，是否刻意保持空白而不是亂補？

原則是先抓有幫助的最小脈絡，不追求上下文越多越好。

### F. 是否需要 live query

- [ ] 使用者是否要求真實數字、真實狀態或最新資料？
- [ ] 現有 wiki / memory 是否不足以支撐回答？
- [ ] 若要 live query，是否先讀對應 `auto-schema`？
- [ ] 若查人名、業務、成員，是否先走 `workspaceMember -> FK`？
- [ ] 若要畫圖，是否已確認流程是「真實查詢 -> VALUES -> report-json」？

任何一項答案不完整，都不應直接查或直接畫。

### G. 是否應升級到跨系統

- [ ] 問題是否涉及訂單、出貨、收款、庫存、工單、批號、設備或能源？
- [ ] 主答案是否落在 ERP / MES / WMS / EMS 的 source-of-truth？
- [ ] Y-CRM 在這題中是否只負責提供客戶與商機背景？

如果答案是 `是`，則：

- [ ] 保留 Y-CRM 作為前置上下文
- [ ] 將任務標記為 `cross_system_request`
- [ ] 指定要 handoff 的目標系統

---

## 4. 任務類型速查

### `product_help`

- [ ] 不打 DB
- [ ] 先讀 `feature-guide.md`

### `entity_summary`

- [ ] 先看客戶 wiki
- [ ] 再決定是否 live query

### `opportunity_analysis`

- [ ] 先看商機頁或模板
- [ ] 查人名時先走 `workspaceMember`

### `line_interaction_review`

- [ ] 把客戶背景一起帶進來
- [ ] 不要只看對話片段

### `sales_report`

- [ ] 一定要真實查詢
- [ ] 一定要 `VALUES -> report-json`

### `write_intent`

- [ ] 先確認目標物件與 id
- [ ] 先判斷風險等級
- [ ] 寫入後要回讀確認

### `cross_system_request`

- [ ] Y-CRM 只負責商業語義
- [ ] 真正答案交由對應 source-of-truth 系統補齊

---

## 5. 不可跳過的 Guardrails

- [ ] 業務資料查詢前，先讀 `auto-schema`
- [ ] 人名查詢先走 `workspaceMember -> FK`
- [ ] 不用顯示用反正規化欄位做篩選
- [ ] 圖表先查真實數據，再用 `VALUES`
- [ ] Y-CRM 不冒充 ERP / MES / WMS / EMS 的真相來源

只要其中一條沒守住，結果就不可信。

---

## 6. 初版驗收問題

每次調整 routing 邏輯後，至少用下面 5 題回測一次：

1. 「Y-CRM 的 LINE 自動回覆要怎麼設定？」
2. 「請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。」
3. 「幫我分析 Y-CRM 裡許子新的商機分布，順便做成圖表。」
4. 「幫我看一下這個客戶最近的 LINE 對話重點，還有下一步要追什麼。」
5. 「這個客戶在 Y-CRM 裡商機很熱，但我想知道他的訂單現在到哪、庫存夠不夠、還有工單有沒有卡住。」

如果其中任一題出現：

- workspace 判斷錯
- 忘記讀 `auto-schema`
- 沒走 `workspaceMember`
- 圖表直接編造
- 該跨系統卻沒升級

就代表 routing 仍未穩定。

---

## 7. 下一步

這份 checklist 完成後，建議下一步是：

1. 建立 `Y-CRM context builder prototype contract`
2. 定義輸入 / 輸出欄位
3. 再選擇要先做文件驅動 prototype，或直接做程式骨架
