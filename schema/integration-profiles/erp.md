# ERP Integration Profile v0.1

> 狀態：phase-1 骨架
> 更新日期：2026-04-22
> 系統類型：ERP / Transaction System

## 1. 目的

這份 integration profile 的目的是先把 `ERP` 在 DenchClaw 裡的角色與接法固定下來，避免之後一邊接系統、一邊改架構邊界。

它回答的問題是：

- ERP 在 DenchClaw 裡扮演什麼角色？
- 哪些資料應由 ERP 作為 source-of-truth？
- planner / context / chart / review / learning loop 應如何對待 ERP？

---

## 2. 系統角色

### Canonical system id

- `erp`

### Display name

- `ERP`

### 類型

- `ERP / Transaction System`

### 在 DenchClaw 中的角色

ERP 是 DenchClaw 的：

1. 交易與單據真實來源
2. 庫存與出貨狀態的重要來源之一
3. 金額、成本、應收應付的重要來源
4. 後續跨系統流程中的核心節點

---

## 3. Source of Truth

ERP 應優先負責：

- `SalesOrder`
- `PurchaseOrder`
- `Invoice`
- `Shipment`
- `Inventory`
- `Receivable`
- `Payable`
- `Cost`

ERP 不應取代：

- CRM 的客戶互動背景
- MES 的工單現場進度
- WMS 的倉位事件細節
- RFID 的事件流
- EMS 的能源量測明細

---

## 4. 建議接入方式

### 讀取通道

- 建議：DuckDB scanner + 唯讀資料庫連線
- 必須：
  - `:memory:`
  - `READ_ONLY`

### 寫入通道

- 建議：ERP 自身 API
- phase-1：暫不開啟正式寫入

---

## 5. Scope 模型

ERP 不應只有單一 workspace 概念。

至少要考慮：

- company
- business unit
- site / plant
- warehouse
- tenant

未來 context engine 應能解析：

- `system = erp`
- `tenant/site/warehouse scope`

---

## 6. 常見 Intent

ERP phase-1 建議優先支援：

- `order_summary`
- `inventory_snapshot`
- `shipment_tracking`
- `invoice_summary`
- `payment_status`
- `procurement_status`
- `cost_analysis`
- `cross_system_request`

---

## 7. Chart / Report 規則

ERP chart 路徑應比 CRM 更保守：

1. 先 query 真實資料
2. 先做聚合
3. 先確認非空
4. 再決定是否輸出 chart

若資料不足：

- 不畫圖
- 回純文字摘要

---

## 8. Risk 分級

ERP phase-1 以 `L0` 唯讀為主。

### L0

- 查詢
- 彙總
- 報表
- 圖表

### L1

- 低風險註記類動作

### L2

- 草稿單據建立

### L3

- 影響交易、庫存、出貨、財務的正式寫入

phase-1 原則：

- 不開 `L2 / L3`
- 先把讀取與分析流程做穩

---

## 9. 與其他系統的關聯

### 與 Y-CRM

- CRM 提供客戶與商業脈絡
- ERP 提供訂單與交易真相

### 與 WMS

- ERP 提供單據與數量定義
- WMS 提供倉位、批次、出入庫事件

### 與 MES

- ERP 提供需求與訂單
- MES 提供工單與現場回報

### 與 RFID

- ERP 不直接取代事件流

### 與 EMS

- ERP 可提供成本背景
- EMS 提供能耗真實量測

---

## 10. Phase-1 建議輸出

ERP phase-1 最先需要的，不是高風險寫入，而是：

- 安全查詢
- summary
- compact context pack
- chart/report guardrail
- source-of-truth 邊界
- review / learning loop 可接入能力

---

## 11. 目前狀態

目前 ERP integration profile 的定位是：

- 架構邊界文件
- phase-1 規劃入口
- 供後續建立 `ERP skill`、`ERP context builder`、`ERP review flow` 使用

它不是已完成 ERP 串接的宣告。
