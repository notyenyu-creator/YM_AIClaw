# DenchClaw ERP 系統串接檢查清單

本清單是 `ERP` 接入 DenchClaw 的第一版工程檢查模板。

它建立在這兩份共用文件之上：

- [DenchClaw_跨系統串接與Agent設計原則.md](/Users/ym/DenchClaw/docs/DenchClaw_跨系統串接與Agent設計原則.md)
- [DenchClaw_系統串接工程檢查清單.md](/Users/ym/DenchClaw/docs/DenchClaw_系統串接工程檢查清單.md)

本文件的角色不是取代共用原則，而是把 `ERP` 的實際風險與重點收斂成更可執行的 domain checklist。

---

## 1. ERP 接入目標

ERP 在 DenchClaw 裡的定位應是：

- 交易與資源系統
- 訂單、採購、庫存、應收應付、成本、出貨等流程的正式來源之一

DenchClaw 接 ERP 的目標不是「讓 AI 能亂查 ERP」，而是：

- 讓 agent 能在正確 scope 內讀到 ERP 真實資料
- 讓跨系統問題有正確 source-of-truth
- 讓 ERP 相關任務能被 planner / context / review / learning loop 安全處理

---

## 2. ERP Source-of-Truth 定位

接 ERP 前必須先定義清楚：

- `SalesOrder`
- `PurchaseOrder`
- `Invoice`
- `Shipment`
- `Inventory`
- `Cost`
- `Receivable / Payable`

各自誰是正式來源。

原則：

- 金額、單據狀態、庫存數量、成本、應收應付，通常以 `ERP` 為主
- `Y-CRM` 可提供商業背景與互動脈絡，但不能取代 ERP 真值
- 若和 `WMS / MES` 重疊，需明確寫出欄位責任邊界

---

## 3. ERP Scope 檢查

- 這一輪是否已成功解析 `system = erp`？
- 是否已解析 `tenant / company / site / warehouse / business unit`？
- schema / API / reference 是否只讀 ERP scope 允許的內容？
- 是否有誤讀到 `Y-CRM` 或其他系統 reference？

原則：

- ERP scope 必須獨立
- 不能沿用 CRM 的欄位猜測方式
- 不能拿 CRM 的人員關聯邏輯硬套到 ERP

---

## 4. ERP Intent 分類

ERP 常見 intent 建議最少包含：

- `order_summary`
- `invoice_summary`
- `inventory_snapshot`
- `shipment_tracking`
- `procurement_status`
- `payment_status`
- `cost_analysis`
- `cross_system_request`
- `write_intent`

檢查問題：

- 主任務是否判正確？
- 是否把「查詢訂單狀態」誤判成一般 CRM 分析？
- 是否把「可用圖表呈現」誤升級成重型報表任務？

---

## 5. ERP Chart / Report Guardrail

ERP 很容易出現高 token 報表需求，所以 chart guardrail 要比 Y-CRM 更嚴格。

檢查問題：

- 是否先拿到真實聚合資料？
- 是否確認資料非空才畫圖？
- 是否限制 panel 數量？
- 是否避免把整張單據明細直接 dump 進 prompt？

原則：

- 先 summary，後 chart
- 先聚合，後可視化
- chart 是輔助視覺，不是唯一輸出方式

---

## 6. ERP 寫入風險分級

ERP 不能沿用 Y-CRM 的低風險假設。

至少要先分：

- `L0` 唯讀查詢
- `L1` 可逆、低風險標記或備註
- `L2` 單據草稿建立
- `L3` 會影響交易、庫存、財務、出貨、結帳的操作

檢查問題：

- 這個動作是否只應讀取？
- 是否必須人工確認？
- 是否需要 read-back 驗證？
- 是否要禁止 agent 直接執行？

原則：

- ERP phase-1 預設以唯讀為主
- write path 必須比 Y-CRM 更保守

---

## 7. ERP Context Pack 設計

ERP context pack 應包含：

- source-of-truth 規則
- 目前 system / tenant / site
- 對應 schema / reference
- live query steps
- write risk
- chart/report guardrail

檢查問題：

- context pack 是否過胖？
- 是否保留 `compact` 原則？
- 是否只帶任務需要的資料？

原則：

- ERP 不得因為資料多就把 prompt 做成資料倉庫
- 要讓 planner 幫忙收斂，不是把所有欄位塞給模型

---

## 8. ERP 與其他系統的交界

ERP 常會和其他系統交會：

- 與 `Y-CRM`：客戶 / 商機 / 訂單轉單
- 與 `WMS`：庫存 / 出貨 / 倉位 / 批次
- 與 `MES`：工單 / 在製 / 生產回報
- 與 `RFID`：事件追蹤 / 物料流
- 與 `EMS`：能源成本 / 設備能耗

檢查問題：

- 這一題是 ERP 單系統問題，還是跨系統問題？
- 是否需要 handoff？
- 是否清楚標出各系統負責哪個部分？

---

## 9. ERP Learning Loop 檢查

ERP learning loop 應更保守。

建議 phase-1 只允許沉澱：

- 查詢 playbook
- 對帳 / 分析流程
- 報表整理規則
- review note
- cross-system mapping note

不應直接自動沉澱：

- 正式交易規則改寫
- 自動生成高風險 write 操作

---

## 10. ERP 測試清單

至少要補：

- unit test：intent / scope / risk / chart guardrail
- integration test：`/api/chat -> planner metadata -> session readback`
- report route test：ERP query / report renderer 真實資料來源
- stale metadata test：ERP turn 之後切非 ERP 是否正確失效

---

## 11. ERP 封板前必問

- 這次接法能不能成為 `WMS / MES / EMS / RFID` 的下一個樣板？
- 這次有沒有把 ERP 特例寫死進平台？
- 這次有沒有讓 token 成本失控？
- 這次 write 風險是不是過度樂觀？
- 這次 chart / report 路徑是否真的只在有非空聚合資料時才畫圖？

---

## 12. 一句話總結

ERP phase-1 的首要目標不是「讓 AI 可以操作 ERP」，而是：

> 先建立一條安全、可控、可審核、可擴充的 ERP 讀取與分析樣板。

只要這條線穩住，後續再往 `WMS / MES / RFID / EMS` 擴會安全很多。
