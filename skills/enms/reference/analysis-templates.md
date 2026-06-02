# EnMS Analysis Templates

## 1. 需量預測 / 智能降載

優先資料：

- `DeviceDataSummaryView`
- `mqtt_raw_data`
- `PowerAccounts`
- `ElectricityMeter`

建議欄位：

- `RecordTime`
- `MaxDemand`
- `TotalConsumption`
- `ps`
- `dmd15`
- `MeterRole`
- `PowerAccountId`

SQL 起手式：

```sql
SELECT
  "RecordTime",
  "MacAddress",
  "CircuitSeq",
  "MeterRole",
  "TotalConsumption",
  "MaxDemand",
  "AvgPowerFactor"
FROM enms.public."DeviceDataSummaryView"
ORDER BY "RecordTime" DESC
LIMIT 200;
```

## 2. 異常偵測 / 根因分析

優先資料：

- `mqtt_raw_data`
- `ElectricityMeter`

建議欄位：

- `ps`
- `pa`
- `pb`
- `pc`
- `pfs`
- `pfa`
- `pfb`
- `pfc`
- `ia`
- `ib`
- `ic`
- `va`
- `vb`
- `vc`
- `qs`
- `quality`
- `connected`
- `thd_*`

SQL 起手式：

```sql
SELECT
  timestamp,
  mac,
  circuit_seq,
  ps,
  pfs,
  ia,
  ib,
  ic,
  va,
  vb,
  vc,
  quality,
  connected
FROM enms.public.mqtt_raw_data
ORDER BY timestamp DESC
LIMIT 300;
```

## 3. 多場域比較 / Benchmarking

優先資料：

- `DeviceDataSummaryView`
- `sites`
- `site_gateways`
- `ComCompany`

SQL 起手式：

```sql
SELECT
  s."SiteId",
  s."SiteName",
  c."CompanyName"
FROM enms.public."sites" s
LEFT JOIN enms.public."ComCompany" c
  ON c."CompanyNo" = s."CompanyNo"
WHERE COALESCE(s."IsActive", true) = true
LIMIT 100;
```

## 4. 能效分析 / 節能挖掘

優先資料：

- `DeviceDataSummaryView`
- `ComCompany`
- `sites`
- `PowerAccounts`

建議欄位：

- `TotalConsumption`
- `MaxDemand`
- `AvgPowerFactor`
- `MinPowerFactor`
- `TotalKvarh`
- `EmployeeNum`
- `TotalFloorArea`
- `AirConditionedArea`

## 5. Alert 智能治理

優先資料：

- `mqtt_raw_data`
- `DemandAlertHistory`
- `ElectricityMeter`
- `PowerAccounts`

若 `DemandAlertHistory` 欄位未定義，先回 `information_schema` 探查。
