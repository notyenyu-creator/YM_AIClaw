# ERP Order Fulfillment Playbook Template

> 來源系統：ERP
> 類型：ERP 分析 playbook

## 1. 使用情境

- 查未出貨訂單
- 查交期延誤
- 查訂單金額分布
- 查訂單 → 出貨進度

## 2. 推薦流程

1. 確認 company / site scope
2. 讀 `skills/erp/SKILL.md`
3. 讀 `skills/erp/reference/auto-schema-erp.md`
4. 先 summary，再 drill-down
5. 若需要圖表，先確認有非空聚合資料

## 3. Guardrails

- 排除 `cancelled_at IS NULL`
- 不要直接 dump 全表
- 不要把 CRM 商業語義誤當成 ERP 單據真相
- 若需要倉位 / 事件細節，handoff 給 WMS / RFID
