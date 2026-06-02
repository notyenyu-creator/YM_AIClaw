# EnMS Load Shedding Playbook Template

## 目標

- 避免超約
- 壓低高峰需量

## 前置資料

- `DeviceDataSummaryView`
- `PowerAccounts`
- `ElectricityMeter`
- `mqtt_raw_data`

## 分析步驟

1. 確認契約容量與目前最大需量
2. 找出高峰時段與高負載迴路
3. 依 MeterRole / DeviceAlias 排序可降載對象
4. 驗證功因與電力品質是否同時異常

## 輸出

- 風險摘要
- 建議降載順序
- 需要追查的設備 / 場域
