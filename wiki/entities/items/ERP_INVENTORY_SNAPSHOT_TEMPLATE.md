# ERP Inventory Snapshot Template

> 來源系統：ERP
> 目的：整理指定品項或一組品項的庫存快照

## 1. 基本資訊

- Item ID:
- Item Name:
- Company / Site:

## 2. 數量摘要

| 標籤 | 欄位 | 中文意義 | 預設值說明 |
|------|------|---------|-----------|
| On Hand | `on_hand_qty` | 在手量 | |
| Available | `available_qty` | 可用量（賣得出去）| |
| Reserved | `reserved_qty` | 保留量 | UAT 多為 0 |
| Allocated | `allocated_qty` | 已分配給訂單量 | UAT 多為 0，**不要當「可用量」用** |
| In Transit | `in_transit_qty` | 在途量 | |
| In Inspect | `in_inspect_qty` | 待品檢量 | |

> ⚠️ 鐵則：使用者問「可用庫存」「能賣多少」一律用 `available_qty`，不要用 `allocated_qty`。

## 3. 成本資訊

- Avg Cost:
- Last Cost:
- Std Cost:

## 4. 風險與觀察

- 是否低庫存：
- 是否異常保留量：
- 是否需要轉 WMS / MES：

## 5. Source-of-Truth 註記

- 本頁以 ERP 庫存快照為主
- 倉位與批次事件應交給 WMS / RFID
