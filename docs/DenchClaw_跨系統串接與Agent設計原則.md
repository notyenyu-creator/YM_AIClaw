# DenchClaw 跨系統串接與 Agent 設計原則

本文件記錄 DenchClaw 目前已確認的核心工程原則。之後不管是持續優化 `Y-CRM`，或新增 `ERP / WMS / MES / RFID / EMS` 等系統串接，都應以這份原則為準。

工程落地版請一併參考：
[DenchClaw_系統串接工程檢查清單.md](/Users/ym/DenchClaw/docs/DenchClaw_系統串接工程檢查清單.md)

---

## 1. 平台層與系統層分離

DenchClaw 的設計必須維持兩層邊界：

- **平台層**
  - `OpenClaw Gateway`
  - `Hermes-style orchestration`
  - `AI Wiki`
  - session / planner / review / learning loop / rolling context
- **系統層**
  - `Y-CRM`
  - `ERP`
  - `WMS`
  - `MES`
  - `RFID`
  - `EMS`

原則：

- 平台層不能被單一系統寫死。
- 系統層不能污染平台層。
- 單一系統的欄位、schema、reference、skill 規則，只能在該系統 scope 內生效。

---

## 2. 架構主軸固定

DenchClaw 的正式架構主軸為：

- `OpenClaw Gateway` 負責入口、session runtime、tool bridge、model call
- `Hermes-style orchestration` 負責 planner、context engine、memory、learning loop、review flow
- `AI Wiki` 負責知識層與持久化知識編譯

原則：

- 不在 OpenClaw 外再套第二套完整 agent runtime。
- 借 Hermes 的方法，不搬 Hermes 的整套 runtime。
- AI Wiki 是知識層，不是第二個 prompt 倉庫。

---

## 3. 要鎖的是 scope，不是寫死邏輯

多系統擴充時，應優先做：

- `system-scoped routing`
- `workspace / tenant / site scoped resolution`
- `schema-scoped reference loading`
- `table-scoped FK / owner mapping`

不應做：

- 把 Y-CRM 欄位規則寫死到整個平台
- 讓 agent 任意猜其他 workspace 的 schema
- 把某個系統的 owner FK 硬套到另一個系統

原則：

- 先解析現在是哪個系統、哪個 workspace、哪個 domain
- 再只允許讀對應的 schema / reference / wiki / playbook

---

## 4. 主任務與呈現能力分離

像「整理客戶背景，但也可以用圖表呈現」這類需求，應拆成：

- **主任務**：`entity_summary`
- **呈現能力**：`chart_capable`

而不是一句提到圖表，就整個升級成 `sales_report`。

原則：

- intent 應先反映使用者的主要商業任務
- 圖表、報表、表格屬於 presentation / rendering layer
- 若資料不足，應保留主任務結果，不強迫畫圖

---

## 5. 圖表一定要走資料 guardrail

圖表生成必須遵守：

- 先查真實資料
- 先確認有非空聚合資料
- 再決定是否輸出 `report-json` 或 chart card

原則：

- 不得輸出空 chart card
- 不得只因為文字答案有數據，就假設圖表 renderer 一定有資料
- 圖表是輔助視覺，不是成功回覆的唯一條件

如果聚合資料為空：

- 回傳文字摘要
- 清楚說明目前沒有足夠 grouped data 可以畫圖

---

## 6. Token 成本優先被控制

DenchClaw 必須持續維持「夠聰明，但不亂燒 token」。

目前固定原則：

- `Rolling Window` 要保留
- `Rolling Summary` 要保留
- planner continuity 只做在前置判斷層，不把整段歷史塞回最終 prompt
- context pack 必須維持 `compact`
- chart 類請求要有 token-budget guardrail

原則：

- 單輪 prompt 能瘦就瘦
- 不傾倒大量 raw query 結果
- optional chart 可以降級成文字摘要
- follow-up continuity 要節制，不能因為想保上下文就把 prompt 膨脹

---

## 7. Learning loop 要安全，不要自動亂寫

Learning loop 的目標是讓系統越用越懂公司，但它必須是可治理的。

目前正式方向：

- `plannerPreflight`
- `plannerContextPack`
- `learning draft`
- `wiki draft writeback`
- `promotion / conflict / resolution`
- `review queue / audit trail`

原則：

- 先 draft，再 review，再 promote
- 不要直接自動寫正式知識頁
- 更不要直接去改 ERP / WMS / MES / RFID / EMS 正式資料

---

## 8. Source-of-truth 必須明確

之後多系統接進來時，模型不能自己決定哪個系統是真的。

原則：

- `CRM`：商業關係與互動脈絡
- `ERP`：交易、訂單、財務、庫存主資料
- `WMS`：倉儲與庫位 / 批次流轉
- `MES`：製造現場、工單、設備、良率
- `RFID`：事件追蹤 / 感測流
- `EMS`：能源與設備能耗資料

任何跨系統回答都必須尊重 source-of-truth 邊界。

---

## 9. Y-CRM 是 phase-1 樣板，不是例外分支

Y-CRM 的角色是：

- 做出第一條可工作的樣板流程
- 驗證 planner / context / review / learning loop
- 為下一個系統提供可複製骨架

原則：

- 修 Y-CRM 時，要想這個模式未來能不能套到其他系統
- 不做只能服務單一案例的短期 hack
- 若是臨時 workaround，必須標記清楚，後續再收斂

---

## 10. 目錄治理也屬於架構的一部分

正式內容與暫存內容必須分開。

原則：

- 正式文件放在 `DenchClaw/docs`
- 正式 schema / wiki / skills / code 都回到正式位置
- `tmp/` 只作 staging，不作正式來源
- 已完成內容必須搬回正式 folder
- 未完成內容才留在 `tmp/staging`

---

## 11. 後續所有系統串接的檢查問題

之後每接一個新系統，都至少要先問：

1. 這一輪是平台層改動，還是系統層改動？
2. 有沒有把某個系統規則寫死到平台裡？
3. source-of-truth 是否清楚？
4. 是否有 scope guardrail？
5. 是否會讓 prompt / token 無限制膨脹？
6. chart / report 路徑是否有 non-empty data guardrail？
7. learning loop 是否仍然可 review、可 audit？
8. 這個模式未來能不能複製到其他系統？

---

## 結論

DenchClaw 的長期方向不是做很多彼此分裂的小整合，而是建立一個：

- 平台層穩定
- 系統層可擴充
- 知識層可累積
- 成本可控制
- 治理可追溯

的公司內部 AI 操作平台。

本文件應作為後續所有系統串接與 agent orchestration 改動的共同準則。
