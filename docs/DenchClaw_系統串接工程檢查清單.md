# DenchClaw 系統串接工程檢查清單

本清單是 [DenchClaw_跨系統串接與Agent設計原則.md](/Users/ym/DenchClaw/docs/DenchClaw_跨系統串接與Agent設計原則.md) 的工程落地版。

使用方式：

- 每次修改 `Y-CRM` 前先看一次
- 每次接入 `ERP / WMS / MES / RFID / EMS` 前先跑一次
- 每次做 planner / context / chart / learning loop / review flow 改動時都要對照

---

## A. 架構邊界

- 這次改動是 **平台層** 還是 **系統層**？
- 有沒有把單一系統規則寫死到平台層？
- 有沒有把平台共用邏輯誤塞進單一系統 folder？
- 這次改動未來能不能複製到其他系統？

---

## B. System Scope

- 這一輪能不能明確解析出 `system`？
- 這一輪能不能明確解析出 `workspace / tenant / site`？
- planner / context pack 是否只讀取目前 system scope 允許的 schema / reference？
- agent 是否可能亂讀別的 workspace 或別的系統 reference？

---

## C. Source of Truth

- 這次回答依賴的核心資料，source-of-truth 是哪個系統？
- 是否有把 `CRM` 語意誤拿去當 `ERP / MES / WMS / EMS / RFID` 真相？
- 如果是跨系統問題，是否有清楚標示 handoff / target systems？

---

## D. Intent 與任務拆分

- 這次主任務是什麼？
- 圖表 / 報表 / 表格 是主任務，還是 presentation layer？
- 有沒有因為一句「用圖表呈現」就把主任務整個判錯？
- follow-up 是否有延續正確主任務，而不是每一輪都從零亂猜？

---

## E. Chart Guardrail

- 這次 chart 是否只在 `非空聚合資料` 存在時才生成？
- 是否可能吐出空 chart card？
- 如果資料不足，是否會優雅降級成文字摘要？
- chart panel 數量是否被限制？

---

## F. Token / Prompt 成本

- 這次改動有沒有讓單輪 prompt 變胖？
- `Rolling Window` 是否仍然保留？
- `Rolling Summary` 是否仍然保留？
- context pack 是否維持 `compact`？
- 是否傾倒太多 raw query result？
- optional chart 是否有 token-budget guardrail？

---

## G. Learning Loop / Review

- 這次改動有沒有破壞 draft → review → promote 的流程？
- learning loop 是否仍然可 review、可 audit？
- 是否留下 reviewer / note / reason / actor？
- 是否仍保有 conflict guardrail？

---

## H. Folder / Repo 治理

- 正式檔案是否都回到正式 folder？
- 系統專屬內容是否放在該系統層？
- 平台層文件是否放在 `DenchClaw/docs`？
- `tmp/` 是否只留下未完成 staging？
- 有沒有把完成檔案錯留在 `tmp/`？

---

## I. 測試與驗證

- 有沒有至少一個單元測試覆蓋這次規則？
- 有沒有至少一個 integration 測試覆蓋真實流程？
- 有沒有驗證 Web 介面仍正常可訪問？
- 如果有 chart / report 路徑，是否有驗證資料真的能畫出來？

---

## J. 封板前必問

- 這次改動是讓系統更聰明，還是只讓它更複雜？
- 這次改動是讓後續多系統更穩，還是只是短期 workaround？
- 如果明天開始接 `ERP / WMS / MES / RFID / EMS`，這個做法能不能被安心沿用？

---

## 建議流程

每次系統串接或重大改動，建議依序做：

1. 先對照本清單
2. 再對照架構原則文件
3. 完成後補測試
4. 最後再做 Web / Session / Chart 實測

這樣可以讓 DenchClaw 長期維持：

- 架構穩定
- 多系統可擴充
- token 成本可控
- learning loop 可治理
- 知識層可持續累積
