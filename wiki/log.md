# DenchClaw Wiki Log

> 狀態：初始骨架
> 更新日期：2026-04-16

## 1. 目的

這份 log 是 DenchClaw Wiki 的時間序列紀錄。

未來應記錄三類事件：

1. `ingest`
2. `query-derived page`
3. `lint / maintenance`

目標是讓人與 agent 都能快速知道：

- 最近新增了哪些知識
- 最近修了哪些頁面
- 最近發現了哪些衝突或缺口

---

## 2. 建議格式

每筆紀錄建議使用以下標題格式：

```text
## [YYYY-MM-DD] <type> | <title>
```

例如：

```text
## [2026-04-16] ingest | OOCHAIN 客戶摘要初稿
## [2026-04-16] query-derived | 訂單延誤分析：SO-20260416-018
## [2026-04-16] lint | 補上 SalesOrder 頁面的 source-of-truth 標記
```

---

## 3. 初始紀錄

## [2026-04-16] bootstrap | 建立 wiki 基礎骨架

- 建立 `wiki/index.md`
- 建立 `wiki/log.md`
- 目的：讓後續的 AI Wiki ingest / query / lint 有穩定入口與時間線

## [2026-04-16] bootstrap | 建立 Y-CRM wiki templates

- 建立 `wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md`
- 建立 `wiki/entities/opportunities/YCRM_OPPORTUNITY_SUMMARY_TEMPLATE.md`
- 建立 `wiki/operations/ycrm/YCRM_LINE_INTERACTION_SUMMARY_TEMPLATE.md`
- 建立 `wiki/playbooks/ycrm/YCRM_SALES_ANALYSIS_PLAYBOOK_TEMPLATE.md`
- 更新 `wiki/index.md`
- 目的：讓 Y-CRM 成為第一個可落地的 AI Wiki / Learning Loop 試點

## [2026-05-04] bootstrap | 建立 ERP wiki templates

- 建立 `wiki/entities/orders/ERP_SALES_ORDER_SUMMARY_TEMPLATE.md`
- 建立 `wiki/entities/items/ERP_INVENTORY_SNAPSHOT_TEMPLATE.md`
- 建立 `wiki/operations/erp/ERP_SHIPMENT_TRACKING_TEMPLATE.md`
- 建立 `wiki/playbooks/erp/ERP_ORDER_FULFILLMENT_PLAYBOOK_TEMPLATE.md`
- 更新 `wiki/index.md`
- 目的：讓 ERP 具備與 Y-CRM 對齊的 AI Wiki / Playbook 基礎層

---

## 4. 後續待補

後續可為每筆 log 增加以下欄位：

- `systems:` 涉及系統
- `objects:` 涉及 canonical objects
- `source_pages:` 原始來源
- `updated_pages:` 被更新頁面
- `operator:` human / AI / cron / subagent
