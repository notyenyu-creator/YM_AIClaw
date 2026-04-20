# Y-CRM Context Builder Spec v0.1

> 狀態：初始骨架
> 更新日期：2026-04-16
> 適用範圍：DenchClaw `Y-CRM first` 路由

## 1. 目的

這份規格定義 DenchClaw 在處理 Y-CRM 相關任務時，應如何判斷：

- 什麼情境要走 Y-CRM context builder
- 要抓哪些上下文
- 先後順序是什麼
- 哪些規則不能被跳過
- 什麼情況應停止在 Y-CRM，什麼情況應升級成跨系統查詢

這份文件的角色不是直接取代 `skills/ycrm/SKILL.md`，而是把「上下文組裝邏輯」固定下來，讓未來的 context engine、本地模型 routing、learning loop 都有一致依據。

---

## 2. 角色定位

Y-CRM context builder 負責把 Y-CRM 從「可查詢的外部系統」提升成「有結構的商業關係上下文來源」。

它主要回答三個問題：

1. 這次問題是不是應先從 Y-CRM 看？
2. 如果是，要先看 skill、wiki、memory 還是真實資料？
3. 哪些資料應只作為商業語義參考，不能被誤當成交易真相？

---

## 3. 觸發條件

以下情境預設應先走 Y-CRM context builder：

1. 使用者明確提到：
   - `Y-CRM`
   - 客戶
   - 聯絡人
   - 公司
   - 商機
   - 業務
   - LINE 對話
   - 業務分析
   - 名單、拜訪、跟進、提案、報價前溝通

2. 問題屬於以下任務類型：
   - 客戶背景整理
   - 商機健康度判斷
   - 指定業務的案件分布
   - 客戶 LINE 互動摘要
   - Y-CRM 產品功能與操作說明
   - CRM 維度的日報、週報、分析報告

3. 問題同時提到 ERP / MES / WMS / EMS，但語義主體仍是：
   - 客戶關係
   - 商機背景
   - 業務活動
   - 客戶溝通歷程

---

## 4. 不應只停在 Y-CRM 的情境

以下情境不能只靠 Y-CRM 回答：

1. 使用者問的是訂單真實狀態、出貨、收款、庫存、工單、批號、設備或能源數據。
2. 使用者要求的答案明顯需要 ERP / MES / WMS / EMS 的 source-of-truth。
3. Y-CRM 內只有商業敘述，但沒有足夠事實可支持結論。

這時候 Y-CRM context builder 的責任是：

1. 先補足客戶與商業脈絡。
2. 明確標記「Y-CRM 只提供商業上下文」。
3. 把任務升級給跨系統 context builder。

---

## 5. 輸入訊號

Y-CRM context builder 應解析以下訊號：

### 5.1 使用者訊號

- 提到的工作區名稱
- 提到的人名
- 提到的公司名 / 客戶名
- 提到的商機名稱或階段
- 提到的 LINE / 對話 / 跟進 / 業務 / 報價等關鍵字
- 問題意圖：查詢、摘要、分析、圖表、操作、寫入

### 5.2 系統訊號

- 預設工作區：`workspace_3joxkr9ofo5hlxjan164egffx`
- 是否已有對應 wiki 頁
- 是否已有可用 playbook
- 是否已有相關 memory / 使用者偏好
- 是否需要 live DB 查詢才能回答

---

## 6. 上下文組裝順序

Y-CRM context builder 應依照下列順序組裝上下文。

### Step 1. 任務分類

先判斷問題屬於哪一類：

- `product_help`
- `entity_summary`
- `opportunity_analysis`
- `line_interaction_review`
- `sales_report`
- `write_intent`
- `cross_system_request`

若分類錯誤，後面整包上下文都會偏掉，因此這一步優先級最高。

### Step 2. 工作區解析

1. 若使用者明確指定工作區，先驗證該 workspace 是否存在。
2. 若使用者只提到 `Y-CRM`，用預設 workspace。
3. 若使用者提到人名，不可把人名誤判成 workspace。
4. 若是非預設 workspace，優先確認對應 auto-schema 是否存在。

### Step 3. 規則上下文

先載入最小必要規則，而不是一開始把全部 reference 塞滿：

1. `skills/ycrm/SKILL.md`
2. `schema/integration-profiles/ycrm.md`
3. 與任務類型對應的 reference / template

建議路由：

- `product_help` -> `feature-guide.md`
- `sales_report` -> `analysis-templates.md`
- `entity_summary` / `opportunity_analysis` -> `auto-schema` + wiki template
- `line_interaction_review` -> LINE interaction template

### Step 4. Wiki 上下文

若已存在相關 wiki 頁，優先抓摘要層，不急著先打 DB：

1. 客戶頁
2. 商機頁
3. LINE 互動摘要頁
4. Playbook

Wiki 的用途是先建立脈絡，不是直接取代真實資料。

### Step 5. Memory 上下文

抓取與本次任務直接相關的長期偏好與歷史經驗，例如：

- 使用者慣用的工作區
- 慣用分析格式
- 常見 chart panel 偏好
- 已知曾經踩過的欄位陷阱

若沒有明確相關 memory，寧可少拿，不要拿泛用噪音。

### Step 6. Live Data 上下文

當 wiki 與 memory 無法支撐回答，或使用者明確要求真實數字時，再進入 live query。

live query 前必須先做：

1. 讀對應 `auto-schema`
2. 必要時用 `information_schema` 驗證欄位
3. 判斷是否需要先查 `workspaceMember`

### Step 7. 寫入風險判斷

若任務包含 create / update / delete：

1. 先判斷風險等級
2. 補齊寫入前必要上下文
3. 高風險任務預設要求人工確認

---

## 7. 核心 guardrails

以下規則屬於不可跳過的 guardrails：

### 7.1 auto-schema 必讀

任何業務資料查詢前，先讀對應 workspace 的 `auto-schema`。

### 7.2 人名查詢必須走 FK

查詢負責業務、成員、相關人員時：

1. 先查 `workspaceMember`
2. 再用 FK id 反查目標資料

不可直接依賴顯示用文字欄位。

### 7.3 report-json 必須嵌入真實結果

圖表流程必須是：

1. 先查真實數據
2. 再用 `VALUES` 內嵌結果
3. 最後輸出 `report-json`

### 7.4 Y-CRM 只負責商業語義真相

Y-CRM 的 source-of-truth 範圍是：

- 客戶
- 聯絡人
- 公司關係
- 商機脈絡
- 業務互動背景

它不是：

- 訂單主狀態
- 庫存主狀態
- 生產主狀態
- 倉儲主狀態
- 能源主狀態

---

## 8. 任務類型對應的最小上下文包

### 8.1 `product_help`

最小上下文包：

1. `skills/ycrm/SKILL.md`
2. `reference/feature-guide.md`

通常不需要 live DB。

### 8.2 `entity_summary`

最小上下文包：

1. `skills/ycrm/SKILL.md`
2. `schema/integration-profiles/ycrm.md`
3. 客戶 wiki 模板或既有客戶頁
4. 對應 workspace `auto-schema`
5. 必要的 live query

### 8.3 `opportunity_analysis`

最小上下文包：

1. `skills/ycrm/SKILL.md`
2. 商機 wiki 模板或既有商機頁
3. `auto-schema`
4. 需要時補 `workspaceMember`
5. 真實查詢結果

### 8.4 `line_interaction_review`

最小上下文包：

1. `skills/ycrm/SKILL.md`
2. `reference/feature-guide.md`
3. LINE interaction wiki 模板或既有頁
4. 與該客戶相關的 live query

### 8.5 `sales_report`

最小上下文包：

1. `skills/ycrm/SKILL.md`
2. `reference/analysis-templates.md`
3. relevant playbook
4. `auto-schema`
5. 真實查詢結果

---

## 9. 升級到跨系統的條件

以下條件成立時，Y-CRM context builder 應把任務交給更高層的 cross-system builder：

1. 使用者問題的主答案不在 Y-CRM source-of-truth 範圍內。
2. 需要用 ERP / MES / WMS / EMS 的資料驗證 Y-CRM 內的說法。
3. 需要同時回答：
   - 客戶背景
   - 訂單狀態
   - 生產進度
   - 出貨或庫存
   - 能源或設備訊號

Y-CRM 在此時仍應保留為前置上下文，而不是被完全忽略。

---

## 10. 預期輸出格式

未來實作 context engine 時，Y-CRM context builder 建議輸出以下結構：

```yaml
system: ycrm
workspace:
  id: workspace_3joxkr9ofo5hlxjan164egffx
  source: default
intent: entity_summary
context_bundle:
  rules:
    - skills/ycrm/SKILL.md
    - schema/integration-profiles/ycrm.md
  wiki:
    - wiki/entities/customers/<page>.md
  memory:
    - <memory-id>
  live_requirements:
    auto_schema: true
    workspace_member_lookup: false
    real_query_required: true
risk_level: L0
handoff:
  cross_system: false
```

這裡的重點不是格式本身，而是要把：

- 任務分類
- 工作區來源
- 取用過的上下文
- 是否需要 live query
- 是否需要 cross-system handoff

都保留下來，讓後續行為可追蹤。

---

## 11. 初版驗收標準

這份規格要能支撐以下驗收：

1. 能正確判斷哪些問題應先走 Y-CRM。
2. 能避免人名 / workspace 混淆。
3. 能避免跳過 auto-schema。
4. 能避免把圖表流程直接做成假資料。
5. 能在需要時正確升級到跨系統查詢。

---

## 12. 下一步

這份 spec 完成後，建議下一步是：

1. 建立 `Y-CRM context builder examples`
2. 再把這份 spec 落成可執行的 context routing 實作
3. 最後才接 learning loop 的自動回寫
