# DenchClaw ERP Phase-1 規劃骨架

> 更新日期：2026-05-04
> 狀態：phase-1 骨架進行中
> 目標：在不破壞既有 `OpenClaw Gateway + Hermes-style orchestration + AI Wiki` 架構下，建立 `ERP` 的第一版安全接入樣板。

---

## 1. 規劃目標

ERP phase-1 的目標不是立刻讓 AI 直接操作 ERP，而是先建立：

1. 安全的讀取入口
2. 正確的 source-of-truth 邊界
3. 可控的 planner / context 模型
4. 可複製到 `WMS / MES / RFID / EMS` 的第二個樣板

---

## 2. 與 Y-CRM 的關係

Y-CRM 已完成 phase-1 主樣板，ERP 會是第二個系統樣板。

ERP 不應重做這些平台層能力：

- planner preflight pattern
- context pack pattern
- review queue pattern
- learning loop pattern
- audit trail pattern

ERP 要做的是：

- 在同一套平台骨架下，補上 ERP 的 domain 規則

---

## 3. Phase-1 範圍

### 先做

- ERP skill 骨架
- ERP integration profile
- ERP source-of-truth 定義
- ERP scope / tenant / warehouse / site 模型
- 安全查詢路徑
- ERP 圖表與 summary guardrail

### 不先做

- 高風險寫入
- 自動單據建立
- 財務正式異動
- 跨系統自動化工作流

---

## 4. 目錄骨架

建議先長成：

```text
/Users/ym/DenchClaw/
  skills/
    erp/
      SKILL.md
  schema/
    integration-profiles/
      erp.md
  docs/
    DenchClaw_ERP_系統串接檢查清單.md
    DenchClaw_ERP_Phase1_規劃骨架.md
```

後續若真的開始落 context builder，再補：

```text
schema/context-builders/erp.md
schema/routing-checklists/erp.md
schema/context-builder-examples/erp.md
```

---

## 5. ERP phase-1 實作順序

### Step 1

固定架構與原則：

- `ERP checklist`
- `ERP integration profile`
- `ERP skill skeleton`

### Step 2

確認真實連線條件：

- DB 類型
- 連線方式
- schema
- tenant/site/warehouse 邊界

### Step 3

做第一版 read-only query path：

- information_schema 探查
- summary query
- chart guardrail

### Step 4

才開始接 planner / context builder

### Step 5

最後才考慮 learning loop 與 review flow

---

## 6. 成功標準

ERP phase-1 若要算成功，至少要做到：

- 能正確辨識 ERP 類問題
- 能正確讀 ERP 真實資料
- 不亂用 CRM 規則
- 不亂畫空圖
- 不亂做高風險寫入
- 能維持 token 成本受控

---

## 7. 接下來真正要做的

當前已完成：

- `ERP checklist`
- `ERP integration profile`
- `ERP skill skeleton`
- `ERP runtime workspace skill sync`
- `ERP context builder`
- `ERP context pack`
- `ERP session planner metadata persistence`
- `ERP wiki / schema phase-1 骨架`

下一步最合理的是：

1. 補 ERP 真實連線條件驗證
2. 定義 ERP phase-1 目標資料範圍
3. 決定第一批要支援的查詢：
   - 訂單
   - 庫存
   - 出貨
   - 應收應付
4. 再往下補 `review / learning loop / writeback`，但不影響既有 Y-CRM 主流程

---

## 8. 一句話總結

ERP phase-1 應該被當成：

> 在 Y-CRM 之後，第一個真正驗證 DenchClaw 能否安全複製到交易型系統的樣板。
