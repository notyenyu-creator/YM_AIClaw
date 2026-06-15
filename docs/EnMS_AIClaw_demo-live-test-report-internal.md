# EnMS AIClaw Demo Live Test Report

Internal demo validation for EnMS DB-first answering.

## Executive Result

- Test time: 2026-06-11
- Target: `http://127.0.0.1:3200/api/chat`
- Scope: 24 live chat prompts, including 6 executive demo questions, 12 common EnMS questions, and 6 general smartness questions.
- Result: 24 / 24 PASS
- EnMS route: 24 / 24
- External web / market answer leakage: 0
- SQL / schema error surfaced to user: 0
- Broken async phrases such as "please wait / I will query again": 0
- Chart-capable responses with `report-json`: 3

## Validation Criteria

Each question was sent to the live app through `/api/chat` with `currentSystemHint: "enms"`.

A response is considered PASS only when:

- It routes to EnMS.
- It produces a real answer instead of an empty or partial response.
- It does not answer with external energy-market information.
- It does not expose SQL/schema errors to the user.
- It does not say it will query later or ask the user to wait.

## Stabilized DB-First Paths

The following high-risk demo paths were stabilized with deterministic EnMS DB answers:

- Demand alert count by account number.
- Recent 7-day alert type summary.
- Recent 7-day alert governance summary.
- Contract-capacity risk ranking.
- Site account mapping.
- Recent 7-day top load / circuit ranking.
- Recent 24-hour anomaly, power-factor, and power-quality analysis.
- Recent 30-day site benchmarking and power-factor ranking.
- Recent 30-day peak demand ranking.
- Latest billing-year 5% / 10% savings estimate.
- Executive three-sentence brief.
- Quick win and maintenance inspection recommendations.

All of the above use local EnMS DB tables such as `DeviceDataSummaryView`, `mqtt_raw_data`, `DemandAlertHistory`, `ElectricityMeter`, `PowerAccounts`, `sites`, and `TaipowerBills`.

## Live Prompt Results

| ID | Type | Status | Time | Session | Prompt |
|---|---|---:|---:|---|---|
| D01 | core | PASS | 2.8s | `ec4a57d9-c4c7-4938-9604-0f1177f3a295` | 請用 EnMS 資料分析阿里山過去 7 天最大需量、契約容量風險，並提供降載建議。 |
| D02 | core | PASS | 3.1s | `2fde0ad1-4409-423f-ab3b-3ed7135538c1` | 請用 EnMS 資料分析阿里山最近 24 小時有哪些異常用電、功因或電力品質問題，並提供可能根因與排查建議。 |
| D03 | core | PASS | 2.5s | `980dac54-7f85-4f5f-ad74-8c9ffcc9751c` | 請找出阿里山最近 7 天最耗電的設備或迴路，列出耗電量與優先關注原因。 |
| D04 | core | PASS | 2.9s | `d197eecb-caac-4efa-9e29-49e047cc45d5` | 請比較阿里山與洋銘資訊最近 30 天的總用電、最大需量、平均功率因數，並做 benchmarking 排名與差異說明。 |
| D05 | core | PASS | 2.6s | `70849e31-aec6-4912-b9cd-0417e8f21e5a` | 請整理最近 7 天的 EnMS 告警與預警摘要，區分需要立即處理、持續觀察與可抑制的項目，並提供治理建議。 |
| D06 | core | PASS | 2.8s | `f9197433-a353-435e-9fc2-68a4a14663e3` | 可以查2025年 的節能ROI嗎？也可以幫我用圖表呈現出來。 |
| E01 | common | PASS | 2.9s | `3c877d5b-4a13-4c49-befb-1c2da2c867bb` | 哪個場域最近 30 天功率因數最差？請用 EnMS DB 回答。 |
| E02 | common | PASS | 2.7s | `cca14988-ec94-464a-a1e7-6a7773512102` | 哪個電號最近最接近或超過契約容量？請列出電號、最高使用率、最大需量與時間。 |
| E03 | common | PASS | 26.4s | `021e8468-b167-4021-9c5b-db3c5a5e5f0e` | 電號 04043717102 最近 6 期台電帳單趨勢如何？ |
| E04 | common | PASS | 2.9s | `95e433a0-3d96-41e9-a709-133b0b29a5a1` | 最近 7 天最常見的 EnMS 告警類型是什麼？請列出各類型筆數。 |
| E05 | common | PASS | 3.1s | `df5dfd15-8a46-4c2e-9c6a-164520592431` | 哪個場域最近 30 天最大需量最高？請列出時間與數值。 |
| E06 | common | PASS | 2.5s | `689c0138-9f8f-4186-a7a0-b085ef6c250c` | 阿里山最近 7 天哪些時間點最接近超約？ |
| E07 | common | PASS | 2.8s | `8e1f2cbf-67e8-4fc3-a959-cde35ca6253e` | 各場域目前對應哪些主要電號？請列出場域與電號。 |
| E08 | common | PASS | 2.9s | `b5be4e8f-c9a7-43fd-8ee6-67acfe02e87c` | 阿里山最近 7 天的設備耗電排行如何？請列出 Top 5。 |
| E09 | common | PASS | 2.8s | `68cea908-fba3-40fa-a3f2-f6e2c53827c8` | 阿里山最近 30 天平均功率因數是否低於建議值？請說明原因。 |
| E10 | common | PASS | 2.6s | `da2e4acc-4495-4411-8473-a404a0ace229` | 最近 7 天的告警有沒有重複噪音或可抑制項目？請用 AlertType、電號與重複次數判斷。 |
| E11 | common | PASS | 3.8s | `abd8b624-3e02-45aa-be6a-5193f6f097bb` | raw layer 與 summary layer 最近是否都有更新？請列出最新資料時間與近 1 天筆數。 |
| E12 | common | PASS | 2.7s | `36d23994-5a6d-46b7-835b-b1b6414d8cbd` | 阿里山如果節電 5% / 10%，大約能省多少？請用本地 EnMS 帳單資料估算。 |
| G01 | general | PASS | 22.6s | `0a4033e7-060b-4f2e-a9c3-ad11e94847c1` | 幫我看一下目前阿里山用電狀況有沒有需要注意的地方。 |
| G02 | general | PASS | 6.3s | `fd0af4f8-13b1-4193-979b-5a003792953e` | 老闆問今天能管有什麼重點，我要怎麼用三句話回報？ |
| G03 | general | PASS | 2.4s | `5e5cbb23-2df5-439e-9d39-b62a228040f1` | 目前最值得先處理的耗電問題是哪一個？請用資料說明。 |
| G04 | general | PASS | 2.8s | `af60319f-fd48-4197-a11a-dd6437738412` | 請幫我找出可能可以節省電費的 quick win。 |
| G05 | general | PASS | 2.6s | `a5bf6932-b1b4-4911-9925-de4227752cc9` | 我想安排維修巡檢，根據 EnMS 資料應該先看哪些設備？ |
| G06 | general | PASS | 2.8s | `8eb5da08-8504-4e7a-8cca-d63849a74efc` | 請用 EnMS 資料回答：現在最可能被投資人問到的風險是什麼？ |

## Notes

- `E03` and `G01` still take longer because they use broader analysis paths instead of a short deterministic response.
- The demo-safe high-risk questions now complete quickly through EnMS DB-first direct paths.
- This report validates the live app behavior after the 3200 restart, not only unit tests.
