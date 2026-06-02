# EnMS Auto-Schema Bootstrap Reference

> 狀態：phase-1 手工整理版
> 注意：這不是完整自動掃描產物，而是 EnMS 初始串接時的 bootstrap 參考。
> 在依賴任何欄位前，**仍然必須重新查 `information_schema` 與 `timescaledb_information`**。

## 1. 分析主線

```text
MQTT raw 時序資料
-> mqtt_raw_data
-> device_data_summary_cagg
-> DeviceDataSummaryView
-> 搭配 ElectricityMeter / PowerAccounts / sites / site_gateways / ComCompany
```

## 2. 優先資料層

### 第一優先：摘要層

#### `DeviceDataSummaryView`

建議用途：

- 需量預測
- 趨勢預判
- KPI / benchmarking
- 場域比較
- 能源密度分析

關鍵欄位：

- `RecordTime`
- `MacAddress`
- `CircuitSeq`
- `MeterType`
- `MeterRole`
- `TotalConsumption`
- `MaxDemand`
- `AvgPowerFactor`
- `MinPowerFactor`
- `ValidSampleCount`
- `ExcludedSampleCount`
- `HasLeadingPowerFactor`
- `TotalKvarh`

### 第二優先：原始時序層

#### `mqtt_raw_data`

建議用途：

- 異常偵測
- 根因分析
- 即時分析
- 細粒度預測特徵

關鍵欄位：

- `timestamp`
- `mac`
- `device_name`
- `device_address`
- `circuit_seq`
- `meter_role`
- `ps`
- `eps`
- `pfs`
- `qs`
- `va`
- `vb`
- `vc`
- `ia`
- `ib`
- `ic`
- `dmd15`
- `quality`
- `connected`

電力品質補充：

- `vab`
- `vbc`
- `vca`
- `avg_phase_volt`
- `avg_cur`
- `thd_va`
- `thd_vb`
- `thd_vc`
- `thd_ia`
- `thd_ib`
- `thd_ic`

### 第三優先：主資料層

#### `ElectricityMeter`

- `DeviceAddress`
- `CircuitSeq`
- `DeviceName`
- `DeviceAlias`
- `MeterRole`
- `DeviceType`
- `DeviceCategoryId`
- `DeviceAreaId`
- `PowerAccountId`
- `AlertLimit`
- `EnableAlert`

#### `PowerAccounts`

- `AccountId`
- `AccountNumber`
- `AccountName`
- `VoltageLevel`
- `CurrentPlanId`
- `DeviceAreaId`
- `IsActive`

#### `sites`

- `SiteId`
- `SiteName`
- `CompanyNo`
- `IsActive`

#### `site_gateways`

- `SiteId`
- `MacAddress`
- `ValidFrom`
- `ValidTo`

#### `ComCompany`

- `CompanyNo`
- `CompanyName`
- `IndustryType`
- `MainService`
- `EmployeeNum`
- `TotalFloorArea`
- `AirConditionedArea`
- `MonthlyRevenue`

### 第四優先：trace 層

#### `mqtt_raw_messages`

- `timestamp`
- `mac`
- `topic`
- `payload`

## 3. 必知關聯

### 原始量測 ↔ 設備主檔

```text
mqtt_raw_data.mac
+ mqtt_raw_data.circuit_seq
↔
ElectricityMeter.DeviceAddress
+ ElectricityMeter.CircuitSeq
```

### 設備主檔 ↔ 電號

```text
ElectricityMeter.PowerAccountId
↔
PowerAccounts.AccountId
```

### Gateway ↔ 場域

```text
site_gateways.MacAddress ↔ gateway / MQTT MAC
site_gateways.SiteId ↔ sites.SiteId
```

### 場域 ↔ 公司

```text
sites.CompanyNo ↔ ComCompany.CompanyNo
```

## 4. Timescale 重點

DenchClaw 探查 EnMS 時，必查：

- `timescaledb_information.hypertables`
- `timescaledb_information.continuous_aggregates`
- `timescaledb_information.jobs`

原因：

- `mqtt_raw_data` 是 raw hypertable
- `DeviceDataSummaryView` 是 summary / cagg 路徑的一部分

## 5. Phase-1 建議查詢順序

1. `SELECT version();`
2. `information_schema.tables`
3. `information_schema.columns`
4. `timescaledb_information.hypertables`
5. `DeviceDataSummaryView`
6. `mqtt_raw_data`
7. `ElectricityMeter`
8. `PowerAccounts`
9. `sites`
10. `site_gateways`
11. `ComCompany`
