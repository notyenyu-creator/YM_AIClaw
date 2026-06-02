# EnMS Integration Profile v0.1

> 狀態：phase-1 骨架
> 更新日期：2026-06-02
> 系統類型：Energy / Utilities / Monitoring System

## 1. 目的

這份 integration profile 的目的，是先把 `EnMS` 在 DenchClaw 裡的角色固定下來，讓後續 planner / context / review / learning 不會一邊接系統一邊漂移。

## 2. 系統角色

### Canonical system id

- `enms`

### Display name

- `EnMS`

### 類型

- `Energy / Utilities / Monitoring System`

### 在 DenchClaw 中的角色

EnMS 是 DenchClaw 的：

1. 能耗與需量真實量測來源
2. 電力品質與告警根因的重要來源
3. 多場域能效比較的重要來源
4. 未來 CRM / ERP / EnMS 聯合分析的營運真相層之一

## 3. Source of Truth

EnMS 應優先負責：

- `Demand`
- `Consumption`
- `PowerQuality`
- `AlertSignal`
- `MeterMeasurement`
- `SiteEnergyBenchmark`

EnMS 不應取代：

- CRM 的客戶互動背景
- ERP 的訂單 / 庫存 / 財務真相
- MES 的現場工序 / 工單真相

## 4. 建議接入方式

### 讀取通道

- 建議：DuckDB scanner + PostgreSQL / TimescaleDB
- 必須：
  - `:memory:`
  - `READ_ONLY`
  - 只連 `.27`

### 寫入通道

- phase-1：不開正式寫入
- 未來：若需要人工設定 / 規則調整，優先走 EnMS 自身 API / service layer

## 5. Scope 模型

EnMS 至少要考慮：

- company
- site
- gateway
- power account
- meter / circuit
- time window

## 6. 常見 Intent

EnMS phase-1 建議優先支援：

- `demand_forecast`
- `anomaly_detection`
- `natural_language_query`
- `site_benchmarking`
- `alert_governance`
- `efficiency_analysis`
- `raw_trace`

## 7. Chart / Report 規則

1. 趨勢 / KPI / 場域比較：優先 `DeviceDataSummaryView`
2. 異常 / 根因 / 電力品質：再進 `mqtt_raw_data`
3. 先聚合、先確認非空，再畫圖
4. 若資料不足，回純文字摘要

## 8. Risk 分級

EnMS phase-1 以 `L0` 唯讀為主。

### L0

- 查詢
- 摘要
- 報表
- 圖表
- 異常判讀建議

### L1

- 低風險治理建議

### L2

- 告警規則草稿

### L3

- 正式修改警報門檻 / 設定 / 控制行為

phase-1 原則：

- 不開 `L2 / L3`
- 先把讀取、分析、join 與 source-of-truth 邊界做穩

## 9. 與其他系統的關聯

### 與 Y-CRM

- Y-CRM 提供商業與客戶背景
- EnMS 提供能耗 / 設備 / 場域真實量測

### 與 ERP

- ERP 提供成本、契約、設備主檔補充語意
- EnMS 提供需量與電力品質真相

### 與 MES

- MES 提供產線 / 工單背景
- EnMS 提供設備負載與能耗訊號

## 10. Phase-1 建議輸出

EnMS phase-1 最需要的不是高風險控制，而是：

- 安全查詢
- compact context pack
- source-of-truth 邊界
- KPI / anomaly / benchmark analysis
- 後續 review / learning loop 可接入能力
