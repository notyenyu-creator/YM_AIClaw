# EnMS Site Benchmarking Playbook

## Goal
建立跨場域比較與 ranking 的標準分析流程。

## Query Pattern
1. 先讀 `DeviceDataSummaryView`
2. join `sites / site_gateways / ComCompany`
3. 在相同時間窗下比較 `TotalConsumption / MaxDemand / AvgPowerFactor`
4. 若 `EmployeeNum / TotalFloorArea` 可用，再補 `kWh/人`、`kWh/坪`
5. 若所有場域都屬於同一公司，明確標註這是 first-pass multi-site comparison，不是完整 peer-group benchmarking

## Output Contract
- 場域排名
- 差異原因
- 改善建議
