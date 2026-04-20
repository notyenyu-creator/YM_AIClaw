# DenchClaw Source of Truth Policy v0.1

> 狀態：初始骨架
> 更新日期：2026-04-16
> 範圍：Y-CRM / ERP / MES / WMS / EMS / Wiki / DenchClaw

## 1. 目的

這份文件定義 DenchClaw 在跨系統讀寫時，如何判定哪個系統才是某類資料的最終主權來源（source of truth）。

目的有三個：

1. 避免模型自行猜測資料主權
2. 在系統衝突時有固定裁決規則
3. 為未來自動化與寫入治理提供基礎

---

## 2. 核心原則

1. 同一主題只應有一個主要 source of truth。
2. 其他系統若持有衍生資料，應視為 downstream / mirrored / operational view。
3. 若發生衝突，先以 source-of-truth 系統為準，再將衝突紀錄於 wiki 或 incident layer。
4. 若某主題暫時沒有單一主權來源，必須明確標示為 `conditional truth` 或 `composite truth`。
5. DenchClaw 自己不應成為交易型資料的主權來源，但可以成為摘要、分析、incident、playbook 的主權層。

EMS 目前屬於待定範圍，因此在正式定義前，不應由模型自行推定 EMS 的資料主權規則。

---

## 3. 第一版主權分配

| 主題 | Primary Source of Truth | 說明 |
|------|-------------------------|------|
| 客戶主資料 | Y-CRM | 客戶基本資料、擁有者、互動關係 |
| 聯絡人資料 | Y-CRM | 聯絡窗口、互動摘要、商機關係 |
| 商機 / 銷售脈絡 | Y-CRM | 商業推進狀態與互動上下文 |
| 銷售訂單主狀態 | ERP | 訂單號、金額、狀態、應收應付 |
| 採購與供應交易 | ERP | 採購單、成本、供應財務流 |
| 產品主資料 | ERP | 產品、料號、單位、成本主檔 |
| 工單 / 製程進度 | MES | 在製、報工、站點、良率 |
| 機台狀態 | MES | 設備狀態與利用率 |
| 倉別 / 庫位 | WMS | 真實倉儲位置與庫位 |
| 批號 / lot trace | WMS | 入出庫批號、可用量、庫位 |
| 出貨執行狀態 | WMS | 揀貨、波次、出貨、追蹤號 |
| EMS 主題 | 待定 | 先保留，待 EMS 業務邊界與物件定義完成 |
| 跨系統分析結論 | Wiki | 經整理後的知識與長期洞察 |
| 使用者偏好 / AI 任務偏好 | DenchClaw Memory | 使用者偏好不是 ERP/CRM 真實交易資料 |
| 跨系統 incident | DenchClaw Incident Layer | DenchClaw 可作為異常整合層 |

---

## 4. Conditional / Composite Truth

有些主題不是單一系統能完整回答，需標示為條件式或組合式真相。

### 4.1 交期狀態

- 商務承諾交期：ERP
- 真實生產進度：MES
- 真實出貨完成狀態：WMS

因此：

- `promised_due_date` 以 ERP 為準
- `production_ready_status` 以 MES 為準
- `shipment_complete_status` 以 WMS 為準

DenchClaw 在回答「為什麼還沒交」時，不能只看單一系統。

### 4.2 客訴 / 品質異常

- 客戶回報與外部互動：Y-CRM
- 生產品質異常：MES
- 批號與出貨流向：WMS
- 退貨 / 補貨 / 財務影響：ERP

因此品質事件應採 `composite truth`：

- 原始客訴來源可來自 Y-CRM
- 製造根因以 MES 為主
- 批號流向以 WMS 為主
- 金額影響以 ERP 為主

---

## 5. 衝突處理規則

當不同系統資料互相矛盾時，DenchClaw 應採以下流程：

1. 標示衝突欄位
2. 標示每個欄位的來源系統與時間戳
3. 根據 source-of-truth 規則決定暫時主版本
4. 若衝突影響營運，建立 incident 或 wiki conflict note
5. 若有寫入行為，禁止自動改寫非主權系統

### 例子：訂單狀態不一致

- ERP 顯示 `Open`
- WMS 顯示 `Shipped`

DenchClaw 不應直接說「ERP 錯了」。

應回答：

- 訂單交易主狀態以 ERP 為主
- 但 WMS 顯示出貨已完成
- 這代表可能存在同步延遲、回寫失敗或狀態映射異常
- 建議建立 incident 並檢查 ERP-WMS integration

---

## 6. 讀取策略

### L0：單系統主題

如果問題只涉及單一主權系統，直接查該系統：

- 客戶負責人是誰？ -> Y-CRM
- 這張採購單金額多少？ -> ERP
- 工單目前站在哪一站？ -> MES
- 這個批號在哪個庫位？ -> WMS

### L1：跨系統主題

若問題本質上是跨系統流程，必須至少讀：

- 主權系統
- 一個以上補充系統
- 若已有 wiki 摘要，先讀 wiki

例如：

- 問交期 -> ERP + MES + WMS
- 問客訴 -> Y-CRM + MES + WMS + ERP

---

## 7. 寫入策略

DenchClaw 的寫入治理原則：

1. 只允許寫入該主題所屬主權系統，或經批准的衍生系統。
2. 不得用 AI 自動修正多系統資料差異，除非流程明確定義。
3. 跨系統矛盾應優先產生 incident / task，而不是直接覆寫。
4. Wiki 與 Memory 可由 DenchClaw 維護，但交易資料不可由 Wiki 反向覆寫來源系統。

---

## 8. DenchClaw 自身可作為主權來源的內容

DenchClaw 可以成為主權來源的資料類型只有這些：

- wiki 摘要頁
- analysis 報告頁
- playbooks / SOP
- AI 生成的 incident
- 使用者偏好與 agent memory
- task orchestration metadata

DenchClaw 不能成為以下主權來源：

- 客戶主檔
- 正式訂單金額
- 正式工單進度
- 倉庫實際庫位
- 財務交易結果

---

## 9. 後續待補

第二版建議補上：

- 每個 canonical object 的 write owner
- 每個 object 的 sync direction
- 每個 object 的 freshness SLA
- 每個 object 的 conflict severity 規則
- incident 分級處理流程
