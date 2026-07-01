# DenchClaw Skill 系統指南

> 給新進同事的主入口說明 — 理解 DenchClaw 如何整合外部系統（Y-CRM、ERP、EnMS、WMS、MES、RFID、EMS 等）。
>
> 閱讀順序建議：
> 1. 先讀本文件，掌握 Skill、IDENTITY、AI Wiki 與 domain runtime 的關係。
> 2. 再讀 [DenchClaw 外部系統整合指南](/Users/ym/DenchClaw/skills/INTEGRATION_GUIDE.md)，照步驟接入新系統。
> 3. 最後用 [工程流程與多 Agent 驗收標準](/Users/ym/DenchClaw/docs/DenchClaw_工程流程與多Agent驗收標準.md) 做小步實作與回歸驗收。
>
> 工程流程與多 Agent 驗收標準請參考：
> [DenchClaw_工程流程與多Agent驗收標準.md](/Users/ym/DenchClaw/docs/DenchClaw_工程流程與多Agent驗收標準.md)
>
> 架構邊界：本指南只描述 Skill / IDENTITY / AI Wiki 的整合方式，不改 DenchClaw 產品架構，不改 OpenClaw Gateway + Hermes-style orchestration + AI Wiki，也不改既有 8 大核心。

---

## 一、架構概覽

DenchClaw 是基於 OpenClaw 的 AI Agent，核心能力是透過**受控 domain runtime** 連接多個外部系統，讓 AI 可以在不接觸明文連線資訊的前提下查詢真實資料、產生圖表與沉澱知識。

```
┌─────────────────────────────────────────────────────┐
│  DenchClaw Web UI (port 3200)                       │
│  使用者跟 AI 聊天，AI 可以查詢多個系統的資料          │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│  OpenClaw Gateway (port 19001)                       │
│                                                      │
│  System Prompt 組裝：                                │
│  1. OpenClaw 內建 base prompt                        │
│  2. IDENTITY.md 完整內容（永遠可見）                  │
│  3. <available_skills> XML（名稱+路徑，不含內容）     │
│  4. 插件注入（dench-ai-gateway, posthog）            │
└─────────────────┬───────────────────────────────────┘
                  │
    ┌─────────────┼──────────────┐
    ▼             ▼              ▼
┌────────┐  ┌────────┐    ┌────────┐
│ Y-CRM  │  │  ERP   │    │  EnMS  │
│Domain  │  │Domain  │    │Domain  │
└────────┘  └────────┘    └────────┘
    ▲             ▲              ▲
    └─────────────┴──────────────┘
        server-side env config
        verified direct query / context builder
```

### 查詢方式

外部系統查詢走 DenchClaw 受控 runtime：

重點：
- DB host、user、password、token 只放在 server-side env config。
- Skill / IDENTITY / report-json / client request 不放 raw connection string。
- 常見問答走 domain verified direct query 或 context builder。
- 圖表資料由 verified rows 產生，避免模型自行編造數字。
- 若某個系統不是 PostgreSQL，也應以 domain adapter 接入，不把 PostgreSQL/DuckDB 視為唯一前提。

---

## 二、三層知識架構

DenchClaw 的 AI 知識分三層，這是最核心的設計：

```
┌──────────────────────────────────────────────┐
│  第一層：IDENTITY.md（永遠可見）               │
│                                               │
│  • 語言規則（繁體中文）                        │
│  • 每個系統的 contract section                 │
│    - 觸發關鍵字                               │
│    - domain runtime 入口與資料邊界              │
│    - 禁止編造資料與不可直連 DB                  │
│  • 圖表輸出格式（report-json）                 │
│  • 預設工作區/schema                           │
│                                               │
│  AI 一定看得到，但不應放明文 secret             │
└──────────────────────────────────────────────┘
         ▼ AI 需要主動 read 檔案
┌──────────────────────────────────────────────┐
│  第二層：SKILL.md（按需載入）                  │
│                                               │
│  • 完整查詢流程（Step 1→5）                    │
│  • 資料庫結構說明                              │
│  • 欄位命名規則                               │
│  • 常見風險與處置方式                          │
│  • REST API 範例（寫入操作）                   │
│  • 問題路由表                                 │
│                                               │
│  模型可能未完整讀取 → 關鍵邊界要在 IDENTITY 重申 │
└──────────────────────────────────────────────┘
         ▼ 高價值案例進 review / promotion
┌──────────────────────────────────────────────┐
│  第三層：AI Wiki / Knowledge Layer             │
│                                               │
│  • wiki / schema / ontology / source-of-truth  │
│  • playbook / operation template               │
│  • review draft → human review → promotion     │
│                                               │
│  長期知識不只放 skill，應沉澱到 AI Wiki          │
└──────────────────────────────────────────────┘
```

### 為什麼要分兩層？

OpenClaw 的 skill 載入機制：
1. Gateway 掃描 `~/.openclaw-dench/workspace/skills/` 下所有 SKILL.md
2. **只把名稱+描述+路徑**放入 system prompt（`<available_skills>` XML）
3. **不嵌入 SKILL.md 全文** — AI 必須自己 `read` 檔案才能看到內容
4. 部分模型或模型路由可能跳過 read 步驟

所以最關鍵的安全邊界必須放在 `IDENTITY.md`，但只能放 domain alias、runtime 入口與規則，不放完整連線資訊。`SKILL.md` 放補充流程；可重用的 schema、playbook 與高價值案例，應透過 review flow 進入 AI Wiki。

---

## 三、新系統接入流程（必讀）

接入任何新系統（ERP、WMS、MES、RFID、EMS，或新增 EnMS 子模組）都遵循相同原則，以小步、可驗收的垂直切片逐步完成：

### Step 1：建立 SKILL.md

**檔案路徑**（兩邊都要有）：
| 位置 | 路徑 | 用途 |
|------|------|------|
| 原始碼 | `/Users/ym/DenchClaw/skills/<系統名>/SKILL.md` | 版本控制 |
| 運行時 | `~/.openclaw-dench/workspace/skills/<系統名>/SKILL.md` | AI 讀取 |

使用模板：`/Users/ym/DenchClaw/skills/_TEMPLATE/SKILL.md`

**SKILL.md 必備結構**：

```markdown
---
name: <system>-database
description: 一行描述（AI 從這裡判斷要不要讀這個 skill）
metadata: { "openclaw": { "always": true, "emoji": "🏭" } }
---

# <系統名稱> 資料庫整合

## 你是誰
你是 <系統名稱> 的專家...

## 最重要的規則
1. 絕對禁止編造資料 — 必須走 DenchClaw domain runtime 或 verified direct query
2. 動態探查優先 — 永遠先確認 schema / context pack / source-of-truth
3. 圖表流程 — verified rows → report-json → chart guardrail
4. 不得在 Skill 內寫入 DB host、user、password、token 或完整 connection string

## 資料入口
（domain alias、server-side env key 名稱、context builder / verified query 入口，不放明文連線資訊）

## 查詢流程（Step 1→5）
（從探查 schema 到輸出圖表的完整步驟）

## 資料庫結構
（表名、主要欄位、關聯）

## 欄位命名規則
（camelCase / snake_case / 拼音 等）

## REST API（寫入操作）
（Create / Update / Delete 的 curl 範例）

## 安全規則
（server-side env、READ_ONLY、敏感欄位、soft-delete 欄位需依 schema 探查結果套用）

## 問題路由表
（什麼問題 → AI 該做什麼）
```

注意：
- `metadata.openclaw.always: true` — 確保 skill 永遠載入
- `inject: true` 是**無效的**（OpenClaw 不認這個欄位）
- 驗收方式：確認 Skill 不含 raw connection string；問題路由能指向 domain pipeline；若該 domain 有可沉澱案例，補上 AI Wiki / playbook 寫回位置。

### Step 2：更新 IDENTITY.md

**加入 contract section**（使用模板：`skills/_TEMPLATE/IDENTITY_CONTRACT.md`）：

```markdown
## <系統名稱> contract (MUST follow)

<系統簡介一句話>

Full skill file: `/Users/ym/.openclaw-dench/workspace/skills/<name>/SKILL.md`

**When user mentions <觸發關鍵字> → follow this contract.**

### Domain Runtime Entry
- Domain alias: `<alias>`
- Runtime env key: `<SYSTEM>_ADAPTER_CONFIG`（只存在 server-side runtime，不寫出值；PostgreSQL adapter 可使用 `<SYSTEM>_PG_CONNECTION` 作為具體實作）
- Query path: `domain verified direct query / context builder`
- Chart path: `verified rows -> report-json`

Default schema: `<預設 schema>`
```

**同時更新 "What you do" section**：
```markdown
- **Query and manage <系統> data** via DenchClaw domain runtime and guarded API
```

驗收方式：
- IDENTITY.md 只保留 domain runtime 入口與安全規則，不含 DB host、user、password、token。
- 小模型即使沒讀完整 Skill，也會知道禁止編造資料、不可直連 DB、必須走 domain pipeline。
- 新增內容經過 PM/TPM/RD/SRE/QA/UIUX 六角色檢查，沒有 P0/P1 阻斷問題。

### Step 3：測試與部署

```bash
# 1. 同步到運行時目錄
cp -r /Users/ym/DenchClaw/skills/<系統名> ~/.openclaw-dench/workspace/skills/

# 2. 重啟 gateway（讓新 skill 生效）
openclaw --profile dench gateway restart

# 3. 開新對話測試（skill 在新對話才載入）
# 到 http://localhost:3200 開一個新 chat
# 輸入：「<系統名> 有哪些資料表？」
# AI 應該走 domain verified direct query / context builder，不直接顯示 DB 連線資訊
```

驗收方式：
- Focused tests 或 smoke test 證明 domain pipeline 可讀資料。
- Cross-domain 測試通過：問 ERP 不出 EnMS 回答，問 Y-CRM 不出 ERP 回答。
- Chart 測試通過：有 verified rows 才畫圖；缺資料、query error、欄位 mapping error 要分得清楚。
- Security 測試通過：raw connection string、unsafe SQL、secret leak 都被拒絕或 redacted。
- Model/source 顯示正確：DB 直查、GX10 本地模型、雲端模型能區分。
- 使用者確認後才 commit。

---

## 四、AI 查詢工作流程（每次查詢都必須遵循）

```
使用者提問
    │
    ▼
Step 1: 判斷工作區 / schema
    │  • 使用者說哪個系統？→ 對應的 DB alias + schema
    │  • 沒指定？→ 用預設值
    │
    ▼
Step 2: 讀取 auto-schema 參考檔（如果有的話）
    │  • read auto-schema-<workspace>.md
    │  • 這份檔案有所有欄位名稱、FK 關聯、enum 值
    │  • 沒有的話 → Step 3 用 information_schema 探查
    │
    ▼
Step 3: 動態探查（如果沒有 auto-schema）
    │  • 查 schemas: information_schema.schemata
    │  • 查 tables:  information_schema.tables
    │  • 查 columns: information_schema.columns
    │  • 取樣: SELECT * FROM <table> LIMIT 5
    │
    ▼
Step 4: 執行查詢
    │  • 走 domain verified direct query / context builder
    │  • 若該 domain schema 有 soft-delete 欄位，依探查結果套用過濾
    │  • 必加 LIMIT（大表保護）
    │  • camelCase 欄位要雙引號
    │
    ▼
Step 5: 輸出結果
    • 先用文字說明數據
    • 再輸出 report-json 區塊
    • SQL 裡用 VALUES 嵌入查詢結果（靜態數據）
    • report-json 是回覆的最後一段
```

### 為什麼「動態探查優先」？

| 原因 | 說明 |
|------|------|
| 多租戶 | 同一系統的不同工作區可能有不同自訂欄位 |
| 系統差異 | ERPNext 用 `tabXxx`、Odoo 用 `snake_case`、SAP 用 `ALL_CAPS` |
| Schema 會變 | 管理員可能新增/修改欄位，不會通知 AI |
| 防止錯誤 | 硬編碼欄位名 → 欄位不存在 → 查詢失敗 |

### report-json 圖表格式

```json
{
  "version": 1,
  "title": "報表標題",
  "panels": [
    {
      "id": "unique_id",
      "title": "圖表標題",
      "type": "pie",
      "sql": "SELECT * FROM (VALUES ('A',10),('B',20)) AS t(name,value)",
      "mapping": { "nameKey": "name", "valueKey": "value" },
      "size": "half"
    }
  ]
}
```

支援圖表類型：`bar`, `line`, `area`, `pie`, `donut`, `radar`, `scatter`, `funnel`

重要：report-json 的 SQL 裡**只能用 VALUES 常量**（chart renderer 只有本地 DuckDB，沒有 postgres_scanner 連線），禁止變數 x, y, z。

---

## 五、Y-CRM 接入範例（實際案例）

Y-CRM 是目前接入的第一個系統，可作為其他系統的參考。

### 基本資訊

| 項目 | 值 |
|------|-----|
| 資料庫 | PostgreSQL，連線字串由 `YCRM_PG_CONNECTION` 等部署環境變數提供 |
| 使用者 | 由部署環境變數提供，不寫在文件或 prompt |
| DuckDB alias | `ycrm` |
| 預設 schema | `workspace_3joxkr9ofo5hlxjan164egffx` |
| 工作區數量 | 9 個（多租戶） |
| 核心表 | company, person, opportunity, task, note, workspaceMember |

### 重要整合經驗

| 風險 | 說明 | 處置 |
|------|------|------|
| `createdByName` ≠ 負責人 | 只是「按下新增按鈕的人」 | 用 FK 欄位 `fuZeYeWuId` |
| 文字欄位不完整 | `fuZeYeWuTuBiaoXianShiYong` 有空字串 | 用 FK `fuZeYeWuId` 兩步查詢 |
| 中文姓名順序 | DB 存西方格式（名 姓） | 同時匹配兩種順序 |
| `createdAt` ≠ 業績年 | 系統建立日期 ≠ 業務日期 | 用 `closeDate` 或自訂日期欄位 |
| 金額單位 | `amountAmountMicros` 是微元 | 除以 1,000,000 |
| 自訂欄位是拼音 | `fuZeYeWu` = 負責業務 | auto-schema 有對照表 |

### 查詢邏輯範例：查某業務的商機

正式執行時應由 DenchClaw domain verified direct query 代為組裝與執行，不把連線資訊放進 prompt。邏輯上分成兩步：

```sql
-- Step 1: 找 workspaceMember ID（匹配中文姓名兩種順序）
SELECT "id", "nameFirstName", "nameLastName"
FROM <domain_alias>.<workspace_schema>."workspaceMember"
WHERE ("nameLastName" || "nameFirstName" = :ownerName
   OR "nameFirstName" || ' ' || "nameLastName" = :ownerName)
  AND <soft_delete_filter_if_available>;

-- Step 2: 用 ID 查商機
SELECT "stage", COUNT(*) AS cnt,
       SUM("amountAmountMicros") / 1000000 AS amount
FROM <domain_alias>.<workspace_schema>.opportunity
WHERE "fuZeYeWuId" = :workspaceMemberId
  AND <soft_delete_filter_if_available>
GROUP BY "stage";
```

### Auto-schema 產生工具

```bash
# 產生某個工作區的 schema 參考檔
python3 /Users/ym/DenchClaw/skills/_TEMPLATE/scripts/scan-schema.py \
  workspace_3joxkr9ofo5hlxjan164egffx

# 輸出到：
# ~/.openclaw-dench/workspace/skills/ycrm/reference/auto-schema-<schema>.md
```

scan-schema.py 功能：
- 列出所有表和欄位
- 識別 FK 關聯
- 拼音 → 中文對照（`fuZeYeWu` → 負責業務）
- 列舉 enum 值（stage, status 等）
- 標記未知 FK（`FK → ?（需探查）`）

### 工作區 Schema 對照表

| 工作區 | Schema |
|--------|--------|
| Y-CRM | `workspace_3joxkr9ofo5hlxjan164egffx` |
| Calleen公司 | `workspace_407lopjyyvm7bxeutk1tvqkpo` |
| HONG MING | `workspace_1g99wpzrdddsuiagn4k5gsecx` |
| HOPET | `workspace_5sgeef4h8tfcbqihsmg9numuh` |
| HUYNH | `workspace_1f50bssxzvj2lwap2po8xu7cn` |
| OOCHAIN | `workspace_39f8dylknizhkvjmva16w79r5` |
| Vivian測試 | `workspace_4k895h39wihc4g84axid1ggzi` |
| 德佟電子 | `workspace_ah8oi06oyuo29ry1ikb89iu96` |
| 鹿氏 | `workspace_2c96vz4nsg10zwua9xejof4m` |

---

## 六、接入新系統檢查清單

新增 ERP / WMS / MES / RFID / EMS，或擴充 EnMS 子模組時，逐項確認：

### 檔案

- [ ] `DenchClaw/skills/<系統>/SKILL.md` 已建立，frontmatter 有 `always: true`
- [ ] `~/.openclaw-dench/workspace/skills/<系統>/SKILL.md` 已同步
- [ ] `~/.openclaw-dench/workspace/IDENTITY.md` 已加 contract section
- [ ] IDENTITY.md 的 "What you do" 已更新

### SKILL.md 內容

- [ ] 資料入口只描述 domain alias、runtime env key 與 context builder，不含明文連線資訊
- [ ] 查詢流程有 Step 1→5
- [ ] 「絕對禁止編造資料」規則存在
- [ ] 欄位命名規則有說明
- [ ] 安全規則（server-side env、READ_ONLY、敏感欄位、soft-delete 欄位依 schema 探查結果套用）
- [ ] 問題路由表
- [ ] 高價值案例有 AI Wiki / playbook / review promotion 的沉澱位置

### IDENTITY.md contract

- [ ] 觸發關鍵字列表
- [ ] DenchClaw domain runtime 入口
- [ ] 預設 schema 指定
- [ ] 「絕對禁止編造資料」（在 IDENTITY.md 重複一次）
- [ ] 不含 DB host、user、password、token 或完整 connection string

### 測試

- [ ] domain verified direct query / context builder 可讀 schema 與代表資料
- [ ] 開新對話，問「<系統>有哪些表？」→ AI 走 domain pipeline，不直連 DB
- [ ] 問業務問題 → AI 回傳正確數據 + source metadata + report-json
- [ ] Cross-domain 回歸：問 ERP 不出 EnMS 回答，問 Y-CRM 不出 ERP 回答
- [ ] Chart 回歸：有資料、無資料、query error、欄位 mapping error 都分得清楚
- [ ] Security 回歸：raw connection string、unsafe SQL、secret leak 都被拒絕或 redacted
- [ ] Model/source 回歸：DB 直查、GX10 本地模型、雲端模型能被 UI 區分
- [ ] UI 回歸：sidebar tag、source badge、chart empty state、tooltip 能清楚呈現，使用者可分辨模型來源、資料來源與空資料原因
- [ ] Wiki writeback 回歸：高價值案例可進入 learning draft、review、promotion 或 playbook
- [ ] 重啟 gateway 後 skill 正常載入

---

## 七、目前已部署的 Skills

| Skill | 路徑 | 功能 | 資料來源 |
|-------|------|------|----------|
| **Y-CRM** | `skills/ycrm/` | CRM 資料查詢、圖表 | server-side domain runtime |
| **CRM** | `skills/crm/` | 本地 DuckDB 工作區管理 | 本地 workspace.duckdb |
| **Browser** | `skills/browser/` | Chromium 瀏覽器自動化 | 網頁 |
| **App Builder** | `skills/app-builder/` | 建立 Dench Apps | 本地檔案系統 |
| **Composio** | `skills/composio-apps/` | 第三方整合（SaaS 工具） | Composio API |

### 子 Skills

| 父 Skill | 子 Skill | 功能 |
|----------|----------|------|
| CRM | `crm/duckdb-operations/` | DuckDB 操作指南 |
| CRM | `crm/object-builder/` | 物件建立 |
| CRM | `crm/relations_display/` | 關聯視覺化 |
| CRM | `crm/reports/` | 報表產生 |
| App Builder | `app-builder/agent-builder/` | AI Agent 建構 |
| App Builder | `app-builder/data-builder/` | 資料層建構 |
| App Builder | `app-builder/game-builder/` | 遊戲建構 |
| App Builder | `app-builder/platform-api/` | Bridge API 參考 |

---

## 八、關鍵檔案路徑速查

### 運行時（AI 讀取）

```
~/.openclaw-dench/
├── workspace/
│   ├── IDENTITY.md                    ← AI system prompt 核心
│   ├── skills/
│   │   ├── ycrm/
│   │   │   ├── SKILL.md              ← Y-CRM 完整技能
│   │   │   └── reference/
│   │   │       └── auto-schema-*.md  ← 自動產生的 schema 參考
│   │   ├── crm/SKILL.md
│   │   ├── browser/SKILL.md
│   │   └── app-builder/SKILL.md
│   └── workspace.duckdb              ← 本地 CRM 資料庫
├── openclaw.json                      ← Gateway 設定
└── logs/
    ├── gateway.log                    ← 運行日誌
    └── gateway.err.log                ← 錯誤日誌
```

### 原始碼（版本控制）

```
/Users/ym/DenchClaw/
├── skills/
│   ├── INTEGRATION_GUIDE.md           ← 整合指南（詳細版）
│   ├── _TEMPLATE/                     ← 新系統模板
│   │   ├── SKILL.md
│   │   ├── IDENTITY_CONTRACT.md
│   │   ├── EXAMPLE_ERP_SKILL.md
│   │   └── scripts/
│   │       └── scan-schema.py         ← Schema 探查工具
│   └── ycrm/
│       └── SKILL.md
└── docs/
    └── SKILL_SYSTEM_GUIDE.md          ← 本文件
```

---

## 九、常見問題

### Q: AI 編造資料怎麼辦？
A: 檢查 IDENTITY.md 是否有「絕對禁止編造資料」與「必須走 domain pipeline」規則。如果模型仍然編造，應補強 verified direct query、context builder、answer template 與回歸題庫，不要把 DB 連線命令寫進 prompt。

### Q: AI 說「找不到表」？
A: 先檢查該 domain 的 server-side env 是否設定、context builder 是否可讀 schema、auto-schema reference 是否最新。不要要求 AI 從 prompt 直接組 raw DB 連線。

### Q: 新增的 skill 沒有生效？
A: 四個檢查點：
1. `~/.openclaw-dench/workspace/skills/<name>/SKILL.md` 存在嗎？
2. Frontmatter 有 `metadata: { "openclaw": { "always": true } }` 嗎？
3. 有重啟 gateway 嗎？（`openclaw --profile dench gateway restart`）
4. 有開新對話嗎？（skill 在新對話才載入）

### Q: 同一個 skill 修改後怎麼生效？
A: 修改 `~/.openclaw-dench/workspace/skills/` 下的檔案後，開一個**新對話**即可（gateway 每次 prompt build 都會重新掃描 skills 目錄）。

### Q: `inject: true` 和 `always: true` 差在哪？
A: `inject: true` **完全無效** — OpenClaw 原始碼不認這個欄位。只有 `always: true` 有作用（在 `metadata.openclaw.always` 裡）。

### Q: 為什麼 report-json 的 SQL 要用 VALUES？
A: Chart renderer 不應直接連外部 DB。外部 domain 的圖表應由 verified direct query 先產生可信 rows，再以 `VALUES` 或 inline verified rows 形式交給 chart renderer，確保文字回答與圖表資料一致。
