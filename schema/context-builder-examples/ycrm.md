# Y-CRM Context Builder Examples v0.1

> 狀態：初始骨架
> 更新日期：2026-04-16
> 對應規格：`schema/context-builders/ycrm.md`

## 1. 目的

這份文件把 `Y-CRM Context Builder Spec` 轉成幾個可驗證的例子，讓後續實作時可以直接比對：

- 問題應如何分類
- 上下文應怎麼選
- 哪些情況要 live query
- 哪些情況要升級成跨系統查詢

這份 examples 的重點不是覆蓋所有情境，而是先把最常見、最容易踩坑的任務路由固定下來。

---

## 2. Example 1: Y-CRM 產品功能問答

### 使用者問題

「Y-CRM 的 LINE 自動回覆要怎麼設定？」

### 預期分類

- intent: `product_help`
- cross_system: `false`

### 預期上下文包

```yaml
system: ycrm
workspace:
  id: workspace_3joxkr9ofo5hlxjan164egffx
  source: default
intent: product_help
context_bundle:
  rules:
    - skills/ycrm/SKILL.md
    - schema/integration-profiles/ycrm.md
  references:
    - skills/ycrm/reference/feature-guide.md
  wiki: []
  memory: []
  live_requirements:
    auto_schema: false
    workspace_member_lookup: false
    real_query_required: false
risk_level: L0
handoff:
  cross_system: false
```

### 判斷理由

這是一個產品操作問題，不需要即時業務資料，也不應先打 DB。最小必要上下文是 skill 與 `feature-guide.md`。

---

## 3. Example 2: 客戶摘要，且有人名 / workspace 混淆風險

### 使用者問題

「請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。」

### 預期分類

- intent: `entity_summary`
- cross_system: `false`

### 預期上下文包

```yaml
system: ycrm
workspace:
  id: workspace_3joxkr9ofo5hlxjan164egffx
  source: explicit_ycrm
intent: entity_summary
context_bundle:
  rules:
    - skills/ycrm/SKILL.md
    - schema/integration-profiles/ycrm.md
  references:
    - skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md
  wiki:
    - wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md
  memory:
    - known_rule: person_name_is_not_workspace
  live_requirements:
    auto_schema: true
    workspace_member_lookup: true
    real_query_required: true
risk_level: L0
handoff:
  cross_system: false
```

### 判斷理由

這題最大的風險不是查不到資料，而是把 `Calleen Hong` 誤判成 workspace。這時候要先固定在 Y-CRM 預設工作區，再走 `workspaceMember -> FK` 的查詢路徑。

---

## 4. Example 3: 商機分析與圖表輸出

### 使用者問題

「幫我分析 Y-CRM 裡許子新的商機分布，順便做成圖表。」

### 預期分類

- intent: `sales_report`
- cross_system: `false`

### 預期上下文包

```yaml
system: ycrm
workspace:
  id: workspace_3joxkr9ofo5hlxjan164egffx
  source: explicit_ycrm
intent: sales_report
context_bundle:
  rules:
    - skills/ycrm/SKILL.md
    - schema/integration-profiles/ycrm.md
  references:
    - skills/ycrm/reference/analysis-templates.md
    - skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md
  wiki:
    - wiki/playbooks/ycrm/YCRM_SALES_ANALYSIS_PLAYBOOK_TEMPLATE.md
    - wiki/entities/opportunities/YCRM_OPPORTUNITY_SUMMARY_TEMPLATE.md
  memory:
    - chart_preference_if_available
  live_requirements:
    auto_schema: true
    workspace_member_lookup: true
    real_query_required: true
    report_json_values_required: true
risk_level: L0
handoff:
  cross_system: false
```

### 判斷理由

這題雖然要輸出圖表，但本質仍是 CRM 業務分析。流程一定要先查真實資料，再把結果轉成 `VALUES`，不能直接假設 chart renderer 可讀 Y-CRM 資料庫。

---

## 5. Example 4: LINE 互動摘要

### 使用者問題

「幫我看一下這個客戶最近的 LINE 對話重點，還有下一步要追什麼。」

### 預期分類

- intent: `line_interaction_review`
- cross_system: `false`

### 預期上下文包

```yaml
system: ycrm
workspace:
  id: workspace_3joxkr9ofo5hlxjan164egffx
  source: default
intent: line_interaction_review
context_bundle:
  rules:
    - skills/ycrm/SKILL.md
    - schema/integration-profiles/ycrm.md
  references:
    - skills/ycrm/reference/feature-guide.md
    - skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md
  wiki:
    - wiki/operations/ycrm/YCRM_LINE_INTERACTION_SUMMARY_TEMPLATE.md
    - wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md
  memory:
    - followup_style_if_available
  live_requirements:
    auto_schema: true
    workspace_member_lookup: false
    real_query_required: true
risk_level: L0
handoff:
  cross_system: false
```

### 判斷理由

這題的主體是 Y-CRM 的差異化能力。除了抓對話內容，也要把客戶背景一起帶進來，這樣「下一步要追什麼」才不會變成脫離商機脈絡的通用建議。

---

## 6. Example 5: 需要升級成跨系統查詢

### 使用者問題

「這個客戶在 Y-CRM 裡商機很熱，但我想知道他的訂單現在到哪、庫存夠不夠、還有工單有沒有卡住。」

### 預期分類

- intent: `cross_system_request`
- cross_system: `true`

### 預期上下文包

```yaml
system: ycrm
workspace:
  id: workspace_3joxkr9ofo5hlxjan164egffx
  source: default
intent: cross_system_request
context_bundle:
  rules:
    - skills/ycrm/SKILL.md
    - schema/integration-profiles/ycrm.md
  references:
    - skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md
  wiki:
    - wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md
    - wiki/entities/opportunities/YCRM_OPPORTUNITY_SUMMARY_TEMPLATE.md
  memory: []
  live_requirements:
    auto_schema: true
    workspace_member_lookup: false
    real_query_required: true
risk_level: L0
handoff:
  cross_system: true
  target_systems:
    - erp
    - wms
    - mes
```

### 判斷理由

這題不能只停在 Y-CRM，因為真正的答案牽涉訂單、庫存與工單。Y-CRM 在這裡的角色是提供客戶與商機背景，然後把任務升級到 ERP / WMS / MES。

---

## 7. Example 6: 寫入意圖

### 使用者問題

「請幫我在 Y-CRM 幫這個客戶新增一筆跟進備註，內容是下週一回覆報價版本。」

### 預期分類

- intent: `write_intent`
- cross_system: `false`

### 預期上下文包

```yaml
system: ycrm
workspace:
  id: workspace_3joxkr9ofo5hlxjan164egffx
  source: default
intent: write_intent
context_bundle:
  rules:
    - skills/ycrm/SKILL.md
    - schema/integration-profiles/ycrm.md
  references:
    - skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md
  wiki:
    - wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md
  memory: []
  live_requirements:
    auto_schema: true
    workspace_member_lookup: false
    real_query_required: true
    rest_write_required: true
    readback_required: true
risk_level: L1
handoff:
  cross_system: false
```

### 判斷理由

這種任務屬於可受控寫入。雖然風險相對低，但仍然應先確認目標客戶與物件 id，寫入後再回讀確認。

---

## 8. 初版驗收方式

這份 examples 初版應能用來驗收：

1. `product_help` 不會錯誤打 DB。
2. `entity_summary` 能避免人名 / workspace 混淆。
3. `sales_report` 會強制走真實查詢 + `VALUES`。
4. `line_interaction_review` 會同時帶入客戶脈絡。
5. `cross_system_request` 會正確把 Y-CRM 視為前置上下文，而不是最終真相。
6. `write_intent` 會先補齊 id 與風險判斷，再進行 REST 寫入。

---

## 9. 下一步

這份 examples 完成後，建議下一步是：

1. 建立 `Y-CRM routing checklist`
2. 再把 checklist 落成可執行的 context builder 原型
3. 最後才把 routing 與 learning loop 連起來
