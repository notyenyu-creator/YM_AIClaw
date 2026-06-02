# EnMS Feature Guide

## 1. EnMS 在 DenchClaw 裡最重要的能力

### 需量預測 + 智能降載

資料來源：

- `DeviceDataSummaryView`
- `mqtt_raw_data`
- `PowerAccounts`
- `ElectricityMeter`

### 異常偵測 + 根因分析

資料來源：

- `mqtt_raw_data`
- `ElectricityMeter`

### 自然語言查詢

資料來源：

- `DeviceDataSummaryView`
- `mqtt_raw_data`
- `ElectricityMeter`
- `PowerAccounts`
- `sites`
- `ComCompany`

### 多場域比較

資料來源：

- `DeviceDataSummaryView`
- `sites`
- `site_gateways`
- `ComCompany`

### Alert 智能治理

資料來源：

- `mqtt_raw_data`
- `DemandAlertHistory`
- `ElectricityMeter`
- `PowerAccounts`

### 能效分析 + 節能挖掘

資料來源：

- `DeviceDataSummaryView`
- `mqtt_raw_data`
- `ComCompany`
- `sites`
- `PowerAccounts`

## 2. 建議回答策略

1. 先判斷題目是趨勢 / 異常 / 場域 / 電號 / 告警 / 能效哪一類
2. 先選對資料層
3. 先把設備別名、電號、場域、公司補齊
4. 再輸出分析與建議

## 3. DenchClaw 目前應避免的做法

- 只回原始量測，不補主資料語意
- 只根據一筆 raw sample 就做結論
- 不看 `DeviceDataSummaryView` 就直接談趨勢與 KPI
- 不看 `mqtt_raw_data` 就直接談異常根因
