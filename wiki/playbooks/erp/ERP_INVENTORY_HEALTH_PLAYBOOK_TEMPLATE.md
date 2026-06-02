# ERP Inventory Health Playbook

## Goal
建立庫存健康檢查的標準分析流程。

## Read First
- `skills/erp/SKILL.md`
- `skills/erp/reference/auto-schema-erp.md`

## Query Pattern
1. 確認 company / site / warehouse scope
2. 先看 `INVENTORY` 聚合後的 available / on-hand
3. 補 `B_ITEM` 取得 item_name 與品類語意

## Output Contract
- 庫存摘要
- 缺料 / 呆滯 / 高庫存風險
- 後續建議
