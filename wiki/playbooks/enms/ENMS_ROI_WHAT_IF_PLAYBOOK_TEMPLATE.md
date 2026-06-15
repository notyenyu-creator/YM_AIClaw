# EnMS ROI / What-if Playbook

## Goal
把能效分析延伸成可說明的節能情境試算，先給出基線、假設、估算節省，再視需要加入投資回收期。

## Query Pattern
1. 先用 `DeviceDataSummaryView` 建立指定時間窗的用電、需量、功因基線。
2. join `site_gateways / sites / ComCompany`，補齊場域與公司語意。
3. join `ElectricityMeter / PowerAccounts`，找出對應電號與 `CurrentPlanId`。
4. 若有資料，再 join `TaipowerBills / ElectricityPricePlans / ElectricityPriceRates` 建立費率與帳單基線。
5. 先做 5% / 10% 節電情境；若使用者提供 CAPEX，再換算 payback。

## Output Contract
- 基線：目前用電 / 需量 / 功因 / 帳單或費率依據
- 情境：5% / 10% 節電、降需量或功因改善假設
- 估算：月節省 / 年節省 / 可推導的簡易回收期
- 邊界：缺哪些電號、帳單、費率或投資金額
