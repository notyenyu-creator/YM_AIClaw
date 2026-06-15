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

建議進一步聚合：

```sql
WITH recent AS (
  SELECT
    d."RecordTime",
    d."MacAddress",
    COALESCE(d."TotalConsumption", 0) AS total_kwh,
    COALESCE(d."MaxDemand", 0) AS peak_kw,
    NULLIF(d."AvgPowerFactor", 0) AS avg_pf
  FROM enms.public."DeviceDataSummaryView" d
  WHERE d."RecordTime" >= NOW() - INTERVAL '30 days'
)
SELECT
  s.site_id,
  s.site_name,
  c."CompanyName",
  ROUND(SUM(recent.total_kwh)::numeric, 2) AS total_kwh_30d,
  ROUND(MAX(recent.peak_kw)::numeric, 2) AS peak_kw_30d,
  ROUND(AVG(recent.avg_pf)::numeric, 3) AS avg_pf_30d,
  ROUND(
    CASE
      WHEN COALESCE(c."TotalFloorArea", 0) > 0
        THEN SUM(recent.total_kwh) / c."TotalFloorArea"
    END::numeric,
    2
  ) AS kwh_per_floor_area_30d,
  ROUND(
    CASE
      WHEN COALESCE(c."EmployeeNum", 0) > 0
        THEN SUM(recent.total_kwh) / c."EmployeeNum"
    END::numeric,
    2
  ) AS kwh_per_employee_30d
FROM recent
JOIN enms.public."site_gateways" g
  ON g.mac_address = recent."MacAddress"
JOIN enms.public."sites" s
  ON s.site_id = g.site_id
LEFT JOIN enms.public."ComCompany" c
  ON c."CompanyNo" = s.company_no
GROUP BY
  s.site_id,
  s.site_name,
  c."CompanyName",
  c."TotalFloorArea",
  c."EmployeeNum"
ORDER BY total_kwh_30d DESC;
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

若要做 ROI / what-if，補查：

- `TaipowerBills`
- `ElectricityPricePlans`
- `ElectricityPriceRates`
- `PowerAccounts.CurrentPlanId`

SQL 起手式：

```sql
WITH site_accounts AS (
  SELECT DISTINCT
    s.site_id,
    s.site_name,
    pa."AccountNumber",
    pa."CurrentPlanId"
  FROM enms.public."sites" s
  JOIN enms.public."site_gateways" g
    ON g.site_id = s.site_id
  JOIN enms.public."ElectricityMeter" e
    ON e."DeviceAddress" = g.mac_address
  LEFT JOIN enms.public."PowerAccounts" pa
    ON pa."AccountId" = e."PowerAccountId"
  WHERE pa."AccountNumber" IS NOT NULL
),
bill_summary AS (
  SELECT
    "AccountNumber",
    COUNT(*) AS bill_count,
    AVG("TotalAmount") AS avg_bill_amount,
    AVG("UsageAmount") AS avg_usage_amount,
    AVG("CurrentAvgRate") AS avg_bill_rate
  FROM enms.public."TaipowerBills"
  GROUP BY "AccountNumber"
)
SELECT
  sa.site_id,
  sa.site_name,
  COUNT(DISTINCT sa."AccountNumber") AS account_count,
  COUNT(DISTINCT CASE WHEN bs.bill_count > 0 THEN sa."AccountNumber" END) AS billed_accounts,
  COUNT(DISTINCT sa."CurrentPlanId") AS active_plan_count,
  ROUND(SUM(COALESCE(bs.avg_bill_amount, 0))::numeric, 2) AS baseline_monthly_bill,
  ROUND(SUM(COALESCE(bs.avg_usage_amount, 0))::numeric, 2) AS baseline_monthly_kwh,
  ROUND(AVG(NULLIF(bs.avg_bill_rate, 0))::numeric, 4) AS avg_bill_rate,
  ROUND((SUM(COALESCE(bs.avg_usage_amount, 0)) * AVG(NULLIF(bs.avg_bill_rate, 0)) * 0.05)::numeric, 2) AS savings_5pct_monthly,
  ROUND((SUM(COALESCE(bs.avg_usage_amount, 0)) * AVG(NULLIF(bs.avg_bill_rate, 0)) * 0.10)::numeric, 2) AS savings_10pct_monthly
FROM site_accounts sa
LEFT JOIN bill_summary bs
  ON bs."AccountNumber" = sa."AccountNumber"
GROUP BY sa.site_id, sa.site_name
ORDER BY sa.site_id;
```

## 5. Alert 智能治理

優先資料：

- `mqtt_raw_data`
- `DemandAlertHistory`
- `ElectricityMeter`
- `PowerAccounts`

若 `DemandAlertHistory` 欄位未定義，先回 `information_schema` 探查。
