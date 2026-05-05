# ERP Context Builder Examples v0.1

> 更新日期：2026-05-04

## Case 1：未出貨訂單

**User message**
`請幫我查 OOCHAIN 本月還沒出貨的訂單`

**Expected**

- intent: `sales_order`
- should route to ERP
- read first: `SKILL.md + auto-schema-erp.md`
- live query: `read_real_data`, `exclude_cancelled_documents`

---

## Case 2：庫存快照 + 圖表

**User message**
`請用圖表分析目前可用庫存最多的前 10 個商品`

**Expected**

- intent: `inventory_status`
- optional chart requested
- chart allowed only if non-empty aggregates available

---

## Case 3：客戶背景，不該被 ERP 搶走

**User message**
`請幫我整理 Calleen Hong 目前負責的客戶背景`

**Expected**

- ERP should not route
- hand back to Y-CRM

---

## Case 4：跨系統問題

**User message**
`請說明這筆訂單的客戶背景、目前出貨狀態和倉位事件`

**Expected**

- Y-CRM: 客戶背景
- ERP: 訂單 / 出貨真相
- WMS: 倉位事件

ERP 不可單獨假裝回答全部。
