# DenchClaw Canonical Ontology v0.1

> 狀態：初始骨架
> 更新日期：2026-04-16
> 範圍：Y-CRM / ERP / MES / WMS / EMS（EMS 暫為保留位）

## 1. 目的

這份 ontology 的目的，是讓 DenchClaw 在跨 Y-CRM、ERP、MES、WMS、EMS 時，使用一套穩定的企業語義層，而不是每次都直接暴露各系統原始表名與欄位給模型。

這份文件定義：

- 企業核心物件
- 各物件的 business meaning
- source systems
- source of truth
- canonical identifier
- canonical fields
- 跨系統欄位對照的設計方向

目前 EMS 尚未進入物件細化階段，因此先保留在 ontology 範圍內，但不急著擴張 canonical object，避免在業務定義尚未穩定前過度抽象。

---

## 2. 設計原則

1. Canonical object 必須先代表「業務語義」，再代表技術資料表。
2. 一個 canonical object 可以對應多個來源系統。
3. source of truth 必須明確，不可由模型臨時猜測。
4. Canonical field 命名優先穩定、可讀、可跨系統重用。
5. 若來源系統欄位衝突，先保留 canonical field，衝突細節記在 mapping 區。

---

## 3. 第一批核心物件

目前第一批建議先落地以下物件：

```text
Customer
Contact
Company
Product
SalesOrder
PurchaseOrder
InventoryItem
InventoryLot
Shipment
WorkOrder
OperationStep
Machine
Warehouse
BinLocation
QualityIssue
Task
Incident
```

這一批已足以支撐：

- 客戶到訂單
- 訂單到生產
- 生產到倉儲
- 客訴到批號追溯

> 備註：EMS 將在 Y-CRM 第一階段對齊完成後，再依其實際業務內容補進第二批 canonical object。

---

## 4. Canonical Object 定義

### 4.1 Customer

- Business meaning：與公司有持續商業往來的客戶主體
- Source systems：Y-CRM, ERP
- Source of truth：Y-CRM
- Canonical identifier：`customer_key`
- Typical aliases：
  - account
  - customer
  - client
  - company account
- Canonical fields：
  - `customer_key`
  - `customer_name`
  - `crm_company_id`
  - `erp_customer_id`
  - `owner_user_id`
  - `segment`
  - `status`
  - `country`
  - `currency`
  - `last_interaction_at`
  - `open_order_count`
  - `open_opportunity_count`

### 4.2 Contact

- Business meaning：客戶或合作對象的自然人聯絡窗口
- Source systems：Y-CRM
- Source of truth：Y-CRM
- Canonical identifier：`contact_key`
- Canonical fields：
  - `contact_key`
  - `full_name`
  - `company_key`
  - `title`
  - `email`
  - `phone`
  - `owner_user_id`
  - `last_contact_at`
  - `interaction_summary`

### 4.3 Company

- Business meaning：企業實體，可對應客戶、供應商、合作方
- Source systems：Y-CRM, ERP
- Source of truth：Y-CRM
- Canonical identifier：`company_key`
- Canonical fields：
  - `company_key`
  - `company_name`
  - `company_type`
  - `tax_id`
  - `industry`
  - `owner_user_id`
  - `billing_customer_id`
  - `shipping_customer_id`

### 4.4 Product

- Business meaning：公司銷售、生產、採購、儲存的產品或料號
- Source systems：ERP, MES, WMS
- Source of truth：ERP
- Canonical identifier：`product_key`
- Canonical fields：
  - `product_key`
  - `sku`
  - `product_name`
  - `specification`
  - `uom`
  - `category`
  - `standard_cost`
  - `list_price`
  - `active_flag`

### 4.5 SalesOrder

- Business meaning：客戶正式下達的銷售訂單
- Source systems：ERP, MES, WMS
- Source of truth：ERP
- Canonical identifier：`sales_order_key`
- Canonical fields：
  - `sales_order_key`
  - `sales_order_no`
  - `customer_key`
  - `status`
  - `order_date`
  - `due_date`
  - `currency`
  - `amount`
  - `warehouse_key`
  - `production_status`
  - `shipment_status`

### 4.6 PurchaseOrder

- Business meaning：對供應商下達的採購訂單
- Source systems：ERP
- Source of truth：ERP
- Canonical identifier：`purchase_order_key`
- Canonical fields：
  - `purchase_order_key`
  - `purchase_order_no`
  - `supplier_key`
  - `status`
  - `order_date`
  - `expected_arrival_date`
  - `currency`
  - `amount`

### 4.7 InventoryItem

- Business meaning：某產品在某倉儲維度下的可管理庫存單位
- Source systems：ERP, WMS
- Source of truth：WMS
- Canonical identifier：`inventory_item_key`
- Canonical fields：
  - `inventory_item_key`
  - `product_key`
  - `warehouse_key`
  - `on_hand_qty`
  - `available_qty`
  - `allocated_qty`
  - `in_transit_qty`
  - `uom`

### 4.8 InventoryLot

- Business meaning：具批號追溯能力的庫存批次
- Source systems：WMS, MES
- Source of truth：WMS
- Canonical identifier：`inventory_lot_key`
- Canonical fields：
  - `inventory_lot_key`
  - `lot_no`
  - `product_key`
  - `warehouse_key`
  - `bin_location_key`
  - `received_at`
  - `expiry_date`
  - `available_qty`
  - `quality_status`
  - `linked_work_order_key`

### 4.9 Shipment

- Business meaning：一次對外出貨事件或出貨單
- Source systems：ERP, WMS
- Source of truth：WMS
- Canonical identifier：`shipment_key`
- Canonical fields：
  - `shipment_key`
  - `shipment_no`
  - `sales_order_key`
  - `warehouse_key`
  - `status`
  - `shipped_at`
  - `carrier`
  - `tracking_no`

### 4.10 WorkOrder

- Business meaning：對應生產製造的工單
- Source systems：MES, ERP
- Source of truth：MES
- Canonical identifier：`work_order_key`
- Canonical fields：
  - `work_order_key`
  - `work_order_no`
  - `product_key`
  - `sales_order_key`
  - `status`
  - `planned_start_at`
  - `planned_end_at`
  - `actual_start_at`
  - `actual_end_at`
  - `planned_qty`
  - `completed_qty`
  - `scrap_qty`

### 4.11 OperationStep

- Business meaning：工單下的工序或站點
- Source systems：MES
- Source of truth：MES
- Canonical identifier：`operation_step_key`
- Canonical fields：
  - `operation_step_key`
  - `work_order_key`
  - `step_code`
  - `step_name`
  - `machine_key`
  - `status`
  - `queue_time_minutes`
  - `run_time_minutes`
  - `yield_rate`

### 4.12 Machine

- Business meaning：生產使用的機台設備
- Source systems：MES
- Source of truth：MES
- Canonical identifier：`machine_key`
- Canonical fields：
  - `machine_key`
  - `machine_code`
  - `machine_name`
  - `line`
  - `status`
  - `utilization_rate`
  - `last_downtime_at`

### 4.13 Warehouse

- Business meaning：實體倉別或倉庫
- Source systems：WMS, ERP
- Source of truth：WMS
- Canonical identifier：`warehouse_key`
- Canonical fields：
  - `warehouse_key`
  - `warehouse_code`
  - `warehouse_name`
  - `site`
  - `status`

### 4.14 BinLocation

- Business meaning：倉內的可定位庫位
- Source systems：WMS
- Source of truth：WMS
- Canonical identifier：`bin_location_key`
- Canonical fields：
  - `bin_location_key`
  - `warehouse_key`
  - `bin_code`
  - `zone`
  - `status`

### 4.15 QualityIssue

- Business meaning：品質異常、客訴、製程缺陷等質量事件
- Source systems：MES, Y-CRM, ERP
- Source of truth：依事件類型決定，初版先以 `issue_origin_system` 輔助判斷
- Canonical identifier：`quality_issue_key`
- Canonical fields：
  - `quality_issue_key`
  - `issue_origin_system`
  - `issue_type`
  - `product_key`
  - `inventory_lot_key`
  - `work_order_key`
  - `customer_key`
  - `severity`
  - `status`
  - `reported_at`
  - `root_cause_summary`

### 4.16 Task

- Business meaning：需要追蹤、執行或提醒的工作項
- Source systems：Y-CRM, DenchClaw
- Source of truth：Y-CRM for business tasks, DenchClaw for AI-generated internal tasks
- Canonical identifier：`task_key`
- Canonical fields：
  - `task_key`
  - `task_type`
  - `title`
  - `owner_user_id`
  - `related_entity_type`
  - `related_entity_key`
  - `status`
  - `due_at`

### 4.17 Incident

- Business meaning：跨部門或跨系統需要追蹤的營運異常事件
- Source systems：DenchClaw, ERP, MES, WMS
- Source of truth：DenchClaw incident layer
- Canonical identifier：`incident_key`
- Canonical fields：
  - `incident_key`
  - `incident_type`
  - `severity`
  - `status`
  - `opened_at`
  - `closed_at`
  - `summary`
  - `related_object_keys`

---

## 5. Mapping 規範

每個 canonical object 未來都應補一段 mapping：

```yaml
mapping:
  ycrm:
    object: company
    key_field: id
  erp:
    table: sales_order
    key_field: order_id
  mes:
    table: work_order
    key_field: wo_id
```

初版先不把所有 mapping 填滿，先把 canonical 物件名稱與字段穩定下來。

---

## 6. 未來擴充規則

後續新增 object 時，必須至少回答：

1. 它的 business meaning 是什麼？
2. 它跨哪些系統存在？
3. 誰是 source of truth？
4. 它的 canonical identifier 是什麼？
5. 它與哪個核心 object 有關？

若回答不出來，表示還不應直接加入 ontology。
