# Y-CRM Integration Profile v0.1

> 狀態：初始骨架
> 更新日期：2026-04-16
> 系統類型：CRM / Product System

## 1. 目的

這份 integration profile 的目的是把 Y-CRM 在 DenchClaw 中的接入方式，整理成一份穩定、可追蹤、可逐步演進的正式規格。

它回答的問題是：

- Y-CRM 是什麼角色？
- 它怎麼連？
- 哪些資料是它負責？
- 哪些 skill / reference / scripts 屬於它？
- 查詢與寫入應遵守什麼規則？
- 未來 context engine 應如何使用它？

---

## 2. 系統角色

### 系統名稱

- Canonical system id：`ycrm`
- Display name：`Y-CRM`
- 類型：`CRM / Product System`

### 在 DenchClaw 中的角色

Y-CRM 是 DenchClaw 的：

1. **商業關係中心**
2. **客戶與聯絡人主語義來源**
3. **商機與業務互動上下文來源**
4. **第一個已完整接入的產品系統**
5. **AI Wiki / Learning Loop 的第一個試點系統**

---

## 3. 連線資訊

### 讀取通道

- 類型：PostgreSQL via DuckDB `postgres_scanner`
- Host：`localhost`
- Port：`5432`
- Database：`default`
- User：`postgres`
- Access mode：`READ_ONLY`

### 寫入通道

- 類型：REST API
- Base URL：
  - 本地開發：`http://localhost:3000`
  - Docker：`http://localhost:8867`
- Auth：Bearer API Key

### 核心原則

1. 查詢走 PostgreSQL + DuckDB
2. 寫入走 REST API
3. 不直接對 PostgreSQL 做寫入
4. 所有資料查詢優先使用真實資料，不得編造

---

## 4. 資產位置

### Repo 位置

- Skill：`/Users/ym/DenchClaw/skills/ycrm/SKILL.md`
- Reference：
  - `/Users/ym/DenchClaw/skills/ycrm/reference/feature-guide.md`
  - `/Users/ym/DenchClaw/skills/ycrm/reference/db-schema-cheatsheet.md`
  - `/Users/ym/DenchClaw/skills/ycrm/reference/analysis-templates.md`
  - `/Users/ym/DenchClaw/skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md`
- Scripts：
  - `/Users/ym/DenchClaw/skills/ycrm/scripts/health-check.sh`
  - `/Users/ym/DenchClaw/skills/ycrm/scripts/workspace-summary.sh`
  - `/Users/ym/DenchClaw/skills/ycrm/scripts/scan-schema.py`
  - `/Users/ym/DenchClaw/skills/ycrm/scripts/scan-schema.sh`

### Runtime 位置

- Skill root：`/Users/ym/.openclaw-dench/workspace/skills/ycrm/`

### 關聯文件

- 架構圖：`/Users/ym/DenchClaw/docs/denchclaw-ycrm-architecture.md`
- 對齊進度：`/Users/ym/DenchClaw/docs/DenchClaw_YCRM_新架構對齊與整合進度.md`
- Source of truth：`/Users/ym/DenchClaw/schema/source-of-truth.md`
- Ontology：`/Users/ym/DenchClaw/schema/ontology.md`

---

## 5. 預設工作區與 schema 策略

### 預設工作區

- 預設 workspace schema：`workspace_3joxkr9ofo5hlxjan164egffx`
- 預設 workspace label：`Y-CRM / youngming`

### 已知工作區

- `workspace_3joxkr9ofo5hlxjan164egffx` — Y-CRM
- `workspace_407lopjyyvm7bxeutk1tvqkpo` — Calleen公司
- `workspace_1g99wpzrdddsuiagn4k5gsecx` — HONG MING
- `workspace_5sgeef4h8tfcbqihsmg9numuh` — HOPET
- `workspace_1f50bssxzvj2lwap2po8xu7cn` — HUYNH
- `workspace_39f8dylknizhkvjmva16w79r5` — OOCHAIN
- `workspace_4k895h39wihc4g84axid1ggzi` — Vivian測試
- `workspace_ah8oi06oyuo29ry1ikb89iu96` — 德佟電子科技
- `workspace_2c96vz4nsg10zwua9xejof4m` — 鹿氏

### 工作區規則

1. 使用者未指定工作區時，用預設 Y-CRM workspace。
2. 使用者提到人名時，不可把人名誤判成 workspace。
3. 若查詢其他工作區，應先確認 schema 與 auto-schema 是否存在。

---

## 6. Source of Truth 角色

Y-CRM 在目前架構中負責：

- 客戶主資料
- 聯絡人
- 商機 / 業務脈絡
- 業務互動背景

Y-CRM 不負責：

- 訂單金額主狀態
- 生產進度主狀態
- 倉位與批號主狀態

也就是說，當未來跨 ERP / MES / WMS 查詢時：

- Y-CRM 提供「商業語義與客戶上下文」
- 其他系統提供「交易、製造、倉儲真相」

---

## 7. Query Profile

### 基本查詢規則

1. 查詢前優先讀 auto-schema
2. 再用 `information_schema` 動態驗證
3. 使用 `READ_ONLY`
4. 使用 `:memory:`
5. 只做 `SELECT`
6. 過濾 `"deletedAt" IS NULL`
7. 使用雙引號包裹 camelCase 欄位

### 關鍵特殊規則

#### 7.1 人名查詢規則

涉及業務負責人、成員、人名關聯時：

1. 先查 `workspaceMember`
2. 拿到 member id
3. 再用 FK 查詢目標記錄

不要直接依賴顯示用文字欄位。

#### 7.2 auto-schema 規則

查詢任何業務資料前，優先讀：

- `auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md`

其他工作區若未生成對應 auto-schema，需 fallback 到：

1. 讀同類 reference
2. 再做 `information_schema` 探查

#### 7.3 report-json 規則

Y-CRM 圖表輸出時：

1. 先查真實數據
2. 再用 `VALUES` 內嵌結果
3. 不讓 chart renderer 直接假設可連 postgres_scanner

---

## 8. Write Profile

### 基本規則

Y-CRM 寫入只允許透過 REST API。

### 寫入流程

1. 先探查欄位
2. 先查是否重複
3. 若有 FK，先查 FK id
4. 執行 REST create / update / delete
5. 回讀確認

### 風險分類建議

- L0：純讀取
- L1：新增 note / task / internal annotation
- L2：更新 person / company / opportunity 常規欄位
- L3：批次更新、刪除、影響業務流程的變更

初版建議：

- Y-CRM 允許作為第一個可受控寫入系統
- 但仍應預設人工確認後再執行高風險變更

---

## 9. Context Engine 使用方式

未來 context engine 若路由到 Y-CRM，應優先抓：

1. 相關 workspace
2. 相關 customer / contact / company / opportunity
3. 相關業務負責人
4. 相關 wiki 摘要頁
5. 相關 playbook / memory

### 適合優先路由到 Y-CRM 的問題

- 這個客戶現在誰在跟？
- 某公司最近有什麼互動？
- 這位業務手上有哪些案子？
- 幫我整理某個商機的狀態
- Y-CRM 的 LINE / workflow / object 功能怎麼用？

---

## 10. Y-CRM 作為第一個 Learning Loop 試點

未來建議先從 Y-CRM 開始長出以下內容：

### Wiki

- 客戶摘要頁
- 商機摘要頁
- 業務人員工作面板頁
- LINE 對話 / 工作流操作知識頁

### Memory

- 使用者偏好的報表格式
- 常查客戶 / 商機
- 慣用的篩選條件與命名方式

### Playbook

- 客戶拜訪前摘要生成
- 商機健康度盤點
- Y-CRM LINE 對話追蹤
- 業務負責人案件分布分析

---

## 11. 已知缺口

目前仍有幾個缺口尚未補齊：

1. 不是每個工作區都有 `auto-schema-*.md`
2. repo 內還沒有 Y-CRM 專屬 wiki 模板
3. context builder 尚未真正落地
4. Y-CRM 尚未有正式 adapter contract

---

## 12. 下一步建議

Y-CRM integration profile 之後，下一小步建議二選一：

1. **Y-CRM Wiki Templates**
   - `wiki/entities/customers/*.md`
   - `wiki/entities/opportunities/*.md`
   - `wiki/playbooks/ycrm/*.md`

2. **Y-CRM Context Builder Spec**
   - 定義哪些問題命中 Y-CRM
   - 定義 query 前要抓哪些上下文
   - 定義與 ERP / MES / WMS 的跨系統交接點

目前我建議先做 **Y-CRM Wiki Templates**，因為這能讓 AI Wiki 與 learning loop 開始真正落地。
