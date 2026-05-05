# ERP Context Builder Spec v0.1

> 狀態：phase-1 初始骨架
> 更新日期：2026-05-04
> 適用範圍：DenchClaw `ERP first` 路由

## 1. 目的

這份規格定義 DenchClaw 在處理 ERP 相關任務時，應如何判斷：

- 什麼情況先走 ERP context builder
- 先抓哪些上下文
- 哪些規則不可跳過
- 什麼情況應升級成跨系統查詢

---

## 2. 角色定位

ERP context builder 負責把 ERP 從「資料庫可查」提升成：

- 有結構的交易上下文來源
- 可控的 source-of-truth 路由器
- 後續 `WMS / MES / EMS / RFID` 可重用的第二個樣板

---

## 3. 觸發條件

以下情境預設先走 ERP：

1. 使用者明確提到：
   - 訂單
   - 採購
   - 庫存
   - 出貨
   - 工單
   - 發票
   - 應收 / 應付

2. 問題屬於：
   - 訂單摘要
   - 交期 / 出貨狀態
   - 庫存快照
   - 採購進度
   - 財務文件狀態

---

## 4. 不應只停在 ERP 的情境

以下情境不能只靠 ERP：

1. 客戶互動背景或商機語義
2. 倉位、批次、出入庫事件細節
3. MES 現場工序或設備即時狀態
4. RFID 事件流或 EMS 能耗量測

此時 ERP 的責任是：

1. 提供交易與單據真相
2. 標示 source-of-truth 邊界
3. handoff 給對應系統

---

## 5. 上下文組裝順序

### Step 1. 任務分類

先判斷：

- `sales_order`
- `purchase_order`
- `inventory_status`
- `shipping_status`
- `production_status`
- `service_ticket`
- `finance_doc`
- `unknown`

### Step 2. Scope 解析

ERP 至少要嘗試確認：

- company
- site
- warehouse（若題目有提）

若使用者未指定，先說明使用預設 company/site。

### Step 3. 規則上下文

優先載入最小必要規則：

1. `skills/erp/SKILL.md`
2. `schema/integration-profiles/erp.md`
3. `skills/erp/reference/auto-schema-erp.md`

### Step 4. Wiki / Playbook

若任務適合摘要或圖表：

- `wiki/entities/orders/...`
- `wiki/entities/items/...`
- `wiki/operations/erp/...`
- `wiki/playbooks/erp/...`

### Step 5. Live Query

任何正式回答前，先：

1. 讀 auto-schema
2. 必要時用 `information_schema`
3. 先 summary、後 drill-down
4. 排除 `cancelled_at IS NULL`

---

## 6. Guardrails

### 6.1 ERP 表名規則不可跳過

- 表名必須 `雙引號 + 全大寫`

### 6.2 預設唯讀

- phase-1 不允許直接寫入 ERP

### 6.3 圖表要先有非空聚合資料

- 不可先吐 chart
- 不可產生空 chart

### 6.4 交易真相優先

- 訂單、出貨、庫存、金額以 ERP 為主
- 不可用 CRM 語義覆蓋 ERP 真相
