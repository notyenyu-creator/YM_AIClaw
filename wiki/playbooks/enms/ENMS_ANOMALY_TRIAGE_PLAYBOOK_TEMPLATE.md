# EnMS Anomaly Triage Playbook

## Goal
標準化異常偵測與根因分析。

## Query Pattern
1. 先找 summary-layer 異常
2. 回鑽 `mqtt_raw_data`
3. 驗證 `quality / connected / thd_* / pfs / ps`

## Output Contract
- 異常摘要
- 最可能根因
- 後續處置
