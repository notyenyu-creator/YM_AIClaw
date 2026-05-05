# ERP Routing Checklist v0.1

> 更新日期：2026-05-04

## 1. 先判斷是否真的屬於 ERP

- 有沒有訂單 / 採購 / 庫存 / 出貨 / 工單 / 財務關鍵字？
- 問題主體是不是交易或單據真相？
- 若只是客戶互動或商機背景，不該被 ERP 搶走。

## 2. 先確認 scope

- 是否已知 company / site？
- 若不清楚，是否已明示使用預設 scope？

## 3. 規則上下文是否足夠

- `skills/erp/SKILL.md`
- `schema/integration-profiles/erp.md`
- `skills/erp/reference/auto-schema-erp.md`

## 4. Live query 前檢查

- 是否先讀 auto-schema？
- 是否需要 `information_schema` 驗欄位？
- 是否排除作廢單？
- 是否限制 `LIMIT`？

## 5. Chart guardrail

- 是否真的有非空聚合資料？
- 是否只畫必要圖？
- 若資料不足，是否退回文字摘要？

## 6. 跨系統 handoff

- 這題是否其實需要 Y-CRM / WMS / MES / RFID / EMS？
- ERP 是否只提供 source-of-truth 片段？
