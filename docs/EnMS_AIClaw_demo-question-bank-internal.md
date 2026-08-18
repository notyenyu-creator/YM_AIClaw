# EnMS AI Demo 問題模板與資料欄位對照

這份文件的目的不是把答案寫死在目前這一批資料，而是建立一份 **可持續沿用的 EnMS 問題模板**。

也就是說：

- 先列出最適合 demo 的 `6` 題核心問題
- 再列出市面上常見、EnMS 常會被問到的 `10~20` 題延伸問題
- 每一題都對應到 **目前 EnMS DB 應該優先取用的資料表 / 欄位**
- SQL 盡量用 **參數化模板**，避免把問題綁死在某一個場域、某一個電號、某一個時間窗

目前這份文件仍會附帶：

- `.27 / EnMS` 當下可驗證的資料路徑
- 哪些類型目前已能穩定回答
- 哪些類型可回答，但要先說明資料限制

---

## 1. 使用原則

### 1.1 不把問題寫死

以下內容盡量都用這種方式描述：

- `某場域`
- `某時間窗`
- `某電號`
- `某設備 / 迴路`
- `某節能情境`

而不是永遠寫成：

- `阿里山`
- `洋銘資訊`
- `04043717102`

這樣未來資料增加、場域增加、即時資料進來時，DenchClaw / EnClaw 仍可沿用同一套問題模板與回答路徑。

### 1.2 目前最優先取用的資料層

目前 EnMS 回答問題時，建議優先順序如下：

1. `DeviceDataSummaryView`
2. `mqtt_raw_data`
3. `ElectricityMeter`
4. `PowerAccounts`
5. `site_gateways`
6. `sites`
7. `ComCompany`
8. `DemandAlertHistory`
9. `TaipowerBills`
10. `ElectricityPricePlans / ElectricityPriceRates`

### 1.3 目前資料驗證狀態

以下資料路徑已確認在 `.27 / EnMS` 有真實資料：

- 場域摘要資料：`DeviceDataSummaryView`
- raw 時序資料：`mqtt_raw_data`
- 告警歷史：`DemandAlertHistory`
- 台電帳單：`TaipowerBills`
- 電號與設備主資料：`PowerAccounts / ElectricityMeter`
- 場域 mapping：`site_gateways / sites`

以下資料目前不適合當明天主 demo：

- `thd_*` 諧波分析
- 天氣校正 forecast
- 產量 / 工單連動單位能耗
- 全自動控制

---

## 2. 核心 6 題 Demo 問題模板

這 6 題是我建議明天 demo 優先問的問題。

---

### 2.1 最大需量與契約容量風險

**問題模板**

```text
請用 EnMS 資料分析【某場域】過去【N】天最大需量、契約容量風險，並提供降載建議。
```

**主要取值表 / 欄位**

- `DeviceDataSummaryView.RecordTime`
- `DeviceDataSummaryView.MaxDemand`
- `DemandAlertHistory.AccountNumber`
- `DemandAlertHistory.CurrentDemand`
- `DemandAlertHistory.ContractCapacity`
- `DemandAlertHistory.UtilizationRate`
- `site_gateways.mac_address`
- `sites.site_name`

**目前回答狀態**

- 可直接回答
- 若有 `DemandAlertHistory`，可同時做契約風險判斷

**SQL 模板**

```sql
with ranked as (
  select
    sg.site_id,
    s.site_name,
    v."RecordTime",
    v."MaxDemand",
    row_number() over (
      partition by sg.site_id
      order by v."MaxDemand" desc nulls last
    ) as rn
  from "DeviceDataSummaryView" v
  join site_gateways sg on sg.mac_address = v."MacAddress"
  join sites s on s.site_id = sg.site_id
  where s.site_name = :site_name
    and v."RecordTime" >= now() - (:days || ' days')::interval
)
select site_id, site_name, "RecordTime", "MaxDemand"
from ranked
where rn = 1;
```

```sql
select
  "AlertTime",
  "AccountNumber",
  "CurrentDemand",
  "ContractCapacity",
  round("UtilizationRate"::numeric, 4) as utilization_rate,
  "AlertType"
from "DemandAlertHistory"
where "AlertTime" >= now() - (:days || ' days')::interval
  and (
    :account_number is null
    or "AccountNumber" = :account_number
  )
order by "AlertTime" desc
limit 50;
```

---

### 2.2 異常偵測與可能根因

**問題模板**

```text
請用 EnMS 資料分析【某場域 / 某時間窗】有哪些異常用電、功因或電力品質問題，並提供可能根因與排查建議。
```

**主要取值表 / 欄位**

- `DeviceDataSummaryView.MinPowerFactor`
- `DeviceDataSummaryView.AvgPowerFactor`
- `DeviceDataSummaryView.ExcludedSampleCount`
- `mqtt_raw_data.ps`
- `mqtt_raw_data.pfs`
- `mqtt_raw_data.quality`
- `mqtt_raw_data.connected`
- `ElectricityMeter.DeviceAlias`

**目前回答狀態**

- 可直接回答第一版異常摘要
- 可做第一版根因分析
- 不建議主打 `THD`，因為目前 `thd_*` 幾乎沒有值

**SQL 模板**

```sql
select
  sg.site_id,
  s.site_name,
  v."MacAddress",
  v."CircuitSeq",
  min(v."MinPowerFactor") as worst_pf,
  avg(v."AvgPowerFactor") as avg_pf,
  sum(v."ExcludedSampleCount") as excluded_samples
from "DeviceDataSummaryView" v
join site_gateways sg on sg.mac_address = v."MacAddress"
join sites s on s.site_id = sg.site_id
where v."RecordTime" >= now() - (:hours || ' hours')::interval
  and (:site_name is null or s.site_name = :site_name)
group by 1,2,3,4
having min(v."MinPowerFactor") < :pf_threshold
    or sum(v."ExcludedSampleCount") > 0
order by worst_pf asc, excluded_samples desc
limit 20;
```

```sql
select
  mac,
  timestamp,
  device_name,
  circuit_seq,
  ps,
  pfs,
  quality,
  connected
from mqtt_raw_data
where timestamp >= now() - (:hours || ' hours')::interval
  and (
    quality is not null
    or connected is not null
    or pfs is not null
  )
order by timestamp desc
limit 100;
```

---

### 2.3 設備 / 迴路耗電排行

**問題模板**

```text
請找出【某場域】最近【N】天最耗電的設備或迴路，列出耗電量與優先關注原因。
```

**主要取值表 / 欄位**

- `DeviceDataSummaryView.TotalConsumption`
- `ElectricityMeter.DeviceAlias`
- `ElectricityMeter.DeviceName`
- `ElectricityMeter.CircuitSeq`
- `site_gateways.mac_address`
- `sites.site_name`

**目前回答狀態**

- 可直接回答

**SQL 模板**

```sql
with meter_site as (
  select distinct
    em."DeviceAddress",
    em."CircuitSeq",
    coalesce(nullif(em."DeviceAlias", ''), em."DeviceName") as meter_name,
    s.site_name
  from "ElectricityMeter" em
  left join site_gateways sg on sg.mac_address = em."DeviceAddress"
  left join sites s on s.site_id = sg.site_id
)
select
  ms.site_name,
  ms.meter_name,
  round(sum(v."TotalConsumption")::numeric, 2) as total_kwh
from "DeviceDataSummaryView" v
join meter_site ms
  on ms."DeviceAddress" = v."MacAddress"
 and coalesce(ms."CircuitSeq"::text, '1') = coalesce(v."CircuitSeq"::text, '1')
where v."RecordTime" >= now() - (:days || ' days')::interval
  and (:site_name is null or ms.site_name = :site_name)
group by 1,2
order by total_kwh desc
limit :top_n;
```

---

### 2.4 多場域 Benchmarking

**問題模板**

```text
請比較【多個場域】最近【N】天的總用電、最大需量、平均功率因數，並做 benchmarking 排名與差異說明。
```

**主要取值表 / 欄位**

- `DeviceDataSummaryView.TotalConsumption`
- `DeviceDataSummaryView.MaxDemand`
- `DeviceDataSummaryView.AvgPowerFactor`
- `site_gateways.site_id`
- `sites.site_name`

**目前回答狀態**

- 可直接回答第一版多場域比較
- 若場域數量少，應明講是 first-pass comparison

**SQL 模板**

```sql
select
  sg.site_id,
  s.site_name,
  sum(v."TotalConsumption") as total_kwh,
  max(v."MaxDemand") as peak_kw,
  round(avg(v."AvgPowerFactor")::numeric, 3) as avg_pf
from "DeviceDataSummaryView" v
join site_gateways sg on sg.mac_address = v."MacAddress"
join sites s on s.site_id = sg.site_id
where v."RecordTime" >= now() - (:days || ' days')::interval
group by 1,2
order by total_kwh desc;
```

---

### 2.5 告警治理摘要

**問題模板**

```text
請整理最近【N】天的 EnMS 告警與預警摘要，區分需要立即處理、持續觀察與可抑制的項目，並提供治理建議。
```

**主要取值表 / 欄位**

- `DemandAlertHistory.AlertType`
- `DemandAlertHistory.AlertTime`
- `DemandAlertHistory.CurrentDemand`
- `DemandAlertHistory.ContractCapacity`
- `DemandAlertHistory.UtilizationRate`
- `DemandAlertHistory.AccountNumber`

**目前回答狀態**

- 可直接回答

**SQL 模板**

```sql
select
  "AlertType",
  count(*) as alert_count
from "DemandAlertHistory"
where "AlertTime" >= now() - (:days || ' days')::interval
group by 1
order by alert_count desc;
```

```sql
select
  "AlertTime",
  "AccountNumber",
  "CurrentDemand",
  "ContractCapacity",
  round("UtilizationRate"::numeric, 4) as utilization_rate,
  "AlertType"
from "DemandAlertHistory"
where "AlertTime" >= now() - (:days || ' days')::interval
order by "AlertTime" desc
limit 50;
```

---

### 2.6 節能 ROI / what-if 試算

**問題模板**

```text
請用 EnMS 資料評估【某場域 / 某電號】最近【N】天的能效表現，並做【X%】節電情境的 what-if 試算。
```

**主要取值表 / 欄位**

- `TaipowerBills.UsageAmount`
- `TaipowerBills.TotalAmount`
- `TaipowerBills.CurrentAvgRate`
- `TaipowerBills.BillingMonth`
- `PowerAccounts.AccountNumber`
- `PowerAccounts.CurrentPlanId`

**目前回答狀態**

- 可直接回答第一版 what-if
- 若要算投資回收期，仍需 CAPEX / 改造成本假設

**SQL 模板**

```sql
with bill_baseline as (
  select
    round(avg(tb."UsageAmount")::numeric, 2) as avg_usage_kwh,
    round(avg(tb."TotalAmount")::numeric, 2) as avg_bill_ntd,
    round(avg(tb."CurrentAvgRate")::numeric, 4) as avg_rate
  from "TaipowerBills" tb
  where tb."AccountNumber" = :account_number
)
select
  avg_usage_kwh,
  avg_bill_ntd,
  avg_rate,
  round(avg_bill_ntd * :saving_ratio, 2) as estimated_bill_saving_ntd
from bill_baseline;
```

---

## 3. 市面上常見的 EnMS 問題模板（延伸 12 題）

以下是能管場景常會被問到、而且目前資料模型大多已能支撐的題目。

### 3.1 哪個場域最近 30 天功率因數最差？

**主要欄位**

- `DeviceDataSummaryView.MinPowerFactor`
- `DeviceDataSummaryView.AvgPowerFactor`
- `sites.site_name`

### 3.2 哪個電號最近最接近或超過契約容量？

**主要欄位**

- `DemandAlertHistory.AccountNumber`
- `DemandAlertHistory.CurrentDemand`
- `DemandAlertHistory.ContractCapacity`
- `DemandAlertHistory.UtilizationRate`

### 3.3 某電號最近 6 期台電帳單趨勢如何？

**主要欄位**

- `TaipowerBills.BillingMonth`
- `TaipowerBills.UsageAmount`
- `TaipowerBills.TotalAmount`
- `TaipowerBills.CurrentAvgRate`

### 3.4 最近 7 天最常見的告警類型是什麼？

**主要欄位**

- `DemandAlertHistory.AlertType`
- `DemandAlertHistory.AlertTime`

### 3.5 哪個場域最近 30 天最大需量最高？

**主要欄位**

- `DeviceDataSummaryView.MaxDemand`
- `sites.site_name`

### 3.6 某場域最近 7 天哪些時間點最接近超約？

**主要欄位**

- `DeviceDataSummaryView.RecordTime`
- `DeviceDataSummaryView.MaxDemand`

### 3.7 各場域目前對應哪些主要電號？

**主要欄位**

- `ElectricityMeter.PowerAccountId`
- `PowerAccounts.AccountNumber`
- `site_gateways.site_id`
- `sites.site_name`

### 3.8 某場域最近 7 天的設備耗電排行如何？

**主要欄位**

- `DeviceDataSummaryView.TotalConsumption`
- `ElectricityMeter.DeviceAlias`
- `ElectricityMeter.DeviceName`

### 3.9 某場域最近 30 天平均功率因數是否低於建議值？

**主要欄位**

- `DeviceDataSummaryView.AvgPowerFactor`
- `DeviceDataSummaryView.MinPowerFactor`

### 3.10 告警有沒有重複噪音或可抑制項目？

**主要欄位**

- `DemandAlertHistory.AlertType`
- `DemandAlertHistory.AlertTime`
- `DemandAlertHistory.AccountNumber`

### 3.11 raw layer 與 summary layer 最近是否都有更新？

**主要欄位**

- `DeviceDataSummaryView.RecordTime`
- `mqtt_raw_data.timestamp`

### 3.12 某場域如果節電 5% / 10%，大約能省多少？

**主要欄位**

- `TaipowerBills.TotalAmount`
- `TaipowerBills.CurrentAvgRate`
- `PowerAccounts.AccountNumber`

### 3.13 電表時序資料目前涵蓋多久？

**問題模板**

```text
目前【某場域 / 某電號 / 授權範圍】的電表時序資料收集了幾天？資料起訖時間與樣本數是多少？
```

**語意邊界**

- 這類問題屬於 `data_coverage`，不是 `site_metadata`，也不是單純 `latest_data`。
- 回答必須說明最早資料、最新資料、實際涵蓋本地日期數、日曆跨度、樣本數與涵蓋電表 / 迴路數。
- 若資料中間有缺日，必須明確區分「日曆跨度」與「實際有資料天數」。
- EnMS Chat 正式路徑只使用 EnMS API 已授權 scoped facts；EnClaw Web 研發模式若直接查 DB，也應使用唯讀 semantic view / verified query。

**主要欄位 / facts**

- `ai_energy_15m_v1.recorded_at`
- `ai_energy_15m_v1.meter_id`
- `ai_energy_15m_v1.company_no`
- `ai_energy_15m_v1.site_id`
- `ai_energy_15m_v1.power_account_id`
- `ai_energy_15m_v1.mac_address`

**回答不可接受情境**

- 只回答目前案場名稱。
- 只回答最新一筆資料時間。
- 用最近 7 天或最近 30 天查詢樣本替代完整資料涵蓋度。

---

## 4. 可直接重複使用的 SQL 模板

### 4.1 場域最大需量模板

```sql
with ranked as (
  select
    sg.site_id,
    s.site_name,
    v."RecordTime",
    v."MaxDemand",
    row_number() over (
      partition by sg.site_id
      order by v."MaxDemand" desc nulls last
    ) as rn
  from "DeviceDataSummaryView" v
  join site_gateways sg on sg.mac_address = v."MacAddress"
  join sites s on s.site_id = sg.site_id
  where (:site_name is null or s.site_name = :site_name)
    and v."RecordTime" >= now() - (:days || ' days')::interval
)
select *
from ranked
where rn = 1;
```

### 4.2 多場域 Benchmark 模板

```sql
select
  sg.site_id,
  s.site_name,
  sum(v."TotalConsumption") as total_kwh,
  max(v."MaxDemand") as peak_kw,
  round(avg(v."AvgPowerFactor")::numeric, 3) as avg_pf
from "DeviceDataSummaryView" v
join site_gateways sg on sg.mac_address = v."MacAddress"
join sites s on s.site_id = sg.site_id
where v."RecordTime" >= now() - (:days || ' days')::interval
group by 1,2
order by total_kwh desc;
```

### 4.3 設備耗電排行模板

```sql
with meter_site as (
  select distinct
    em."DeviceAddress",
    em."CircuitSeq",
    coalesce(nullif(em."DeviceAlias", ''), em."DeviceName") as meter_name,
    s.site_name
  from "ElectricityMeter" em
  left join site_gateways sg on sg.mac_address = em."DeviceAddress"
  left join sites s on s.site_id = sg.site_id
)
select
  ms.site_name,
  ms.meter_name,
  round(sum(v."TotalConsumption")::numeric, 2) as total_kwh
from "DeviceDataSummaryView" v
join meter_site ms
  on ms."DeviceAddress" = v."MacAddress"
 and coalesce(ms."CircuitSeq"::text, '1') = coalesce(v."CircuitSeq"::text, '1')
where v."RecordTime" >= now() - (:days || ' days')::interval
  and (:site_name is null or ms.site_name = :site_name)
group by 1,2
order by total_kwh desc
limit :top_n;
```

### 4.4 告警治理模板

```sql
select
  "AlertType",
  count(*) as alert_count
from "DemandAlertHistory"
where "AlertTime" >= now() - (:days || ' days')::interval
group by 1
order by alert_count desc;
```

### 4.5 ROI / what-if 模板

```sql
with bill_baseline as (
  select
    round(avg(tb."UsageAmount")::numeric, 2) as avg_usage_kwh,
    round(avg(tb."TotalAmount")::numeric, 2) as avg_bill_ntd,
    round(avg(tb."CurrentAvgRate")::numeric, 4) as avg_rate
  from "TaipowerBills" tb
  where tb."AccountNumber" = :account_number
)
select
  avg_usage_kwh,
  avg_bill_ntd,
  avg_rate,
  round(avg_bill_ntd * :saving_ratio, 2) as estimated_bill_saving_ntd
from bill_baseline;
```

---

## 5. 目前不建議寫成主 demo 的題目

以下題目是市面上也常見，但目前不適合主打：

### 5.1 諧波 / THD 異常分析

原因：

- 目前 `mqtt_raw_data` 內 `thd_*` 幾乎沒有值

### 5.2 天氣校正後的需量預測

原因：

- 目前 EnMS DB 內沒有完整氣象資料欄位

### 5.3 產量 / 工單連動的單位能耗

原因：

- 這類題目需要 ERP / MES 或外部資料

### 5.4 全自動控制 / 閉環控制

原因：

- 目前 demo 重點仍應放在分析、預警、告警治理與建議

---

## 6. 明天 Demo 的實際建議

建議順序：

1. 最大需量與契約容量風險
2. 異常與可能根因
3. 設備 / 迴路耗電排行
4. 多場域 Benchmarking
5. 告警治理摘要
6. 節能 ROI / what-if

這 6 題的好處是：

- 都能對到目前 DB 已存在的主要資料表
- 都能由 `DeviceDataSummaryView / DemandAlertHistory / TaipowerBills` 組合出答案
- 不需要把答案綁死在今天只有哪一個場域或哪一個電號
- 未來資料變多時，仍然能延用同一組問題模板
