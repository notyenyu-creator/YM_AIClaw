# DenchClaw 外部系統整合指南

> 本文件以 **Y-CRM (Twenty CRM)** 的整合為實際範例，說明如何讓 DenchClaw AI 連接任意外部 PostgreSQL 系統（ERP、WMS、MES 等）。

---

## 架構概念

```
┌─────────────────────────────────────────────────────────────┐
│  DenchClaw AI（OpenClaw Agent）                              │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │  DuckDB :memory:  │    │  curl / fetch    │               │
│  │  + postgres_scanner│    │  REST / GraphQL  │               │
│  │  (唯讀查詢)        │    │  (寫入操作)       │               │
│  └────────┬─────────┘    └────────┬─────────┘               │
│           │                       │                          │
└───────────┼───────────────────────┼──────────────────────────┘
            │ READ_ONLY             │ Auth Token
            ▼                       ▼
    ┌───────────────┐       ┌───────────────┐
    │  PostgreSQL   │       │  REST API     │
    │  (外部系統 DB) │       │  (外部系統)    │
    └───────────────┘       └───────────────┘
```

**核心原則：**
- **讀取**：DuckDB `postgres_scanner` 擴充，`READ_ONLY` 模式連接外部 PostgreSQL
- **寫入**：透過外部系統自身的 REST/GraphQL API（帶 Auth Token）
- **隔離**：使用 `:memory:` DuckDB 實例，不影響 DenchClaw 的 `workspace.duckdb`
- **安全**：SELECT only，跳過密碼/token 等敏感欄位

---

## 整合三步驟

### 步驟 1：建立 Skill 檔案

在 `~/.openclaw-dench/workspace/skills/<system-name>/SKILL.md` 建立新 Skill。

**路徑規則：**
- 運行時路徑：`~/.openclaw-dench/workspace/skills/<name>/SKILL.md`（Agent 讀取）
- 原始碼路徑：`/Users/ym/DenchClaw/skills/<name>/SKILL.md`（版本控制）
- 兩份保持同步

**Frontmatter 必要欄位：**
```yaml
---
name: <system-name>-database
description: 一行描述此 Skill 的功能
metadata: { "openclaw": { "always": true, "emoji": "🏭" } }
---
```

- `always: true` — 每次對話自動注入，AI 永遠知道這個系統
- **不要用 `inject: true`**（這不是有效的 OpenClaw metadata key）

**Skill 內容架構：**
```markdown
# <系統名稱> Database Integration

## Connection（連線模板）
## Query Workflow（查詢流程 — 動態探查優先）
## Schema Structure（Schema 結構概覽）
## Column Naming Conventions（欄位命名規則）
## REST API for Write Operations（寫入操作）
## Important Notes（安全規則與注意事項）
```

→ 完整模板見 `skills/_TEMPLATE/SKILL.md`

### 步驟 2：更新 IDENTITY.md

在 `~/.openclaw-dench/workspace/IDENTITY.md` 新增一段 contract：

```markdown
## <系統名稱> (External <系統類型>) contract

The user operates a **<系統名稱>** (<系統描述>) with real business data stored in a **separate PostgreSQL database**.

Your <系統名稱> integration behavior is defined by the skill at:
`/Users/ym/.openclaw-dench/workspace/skills/<name>/SKILL.md`

- **CRITICAL**: When the user asks about <觸發關鍵字>，use the <系統名稱> skill via postgres_scanner `exec`.
- **Always discover tables/columns first** before assuming anything exists.
- Always load and follow the <系統名稱> skill for queries and writes.
- Treat the <系統名稱> skill as always-on system context.
```

同時在「What you do」section 新增一行描述。

### 步驟 3：測試驗證

```bash
# 1. 確認 PostgreSQL 可連接
duckdb -json ':memory:' "
  INSTALL postgres_scanner; LOAD postgres_scanner;
  ATTACH 'dbname=<DB_NAME> user=<USER> password=<PASS> host=localhost port=<PORT>'
  AS test (TYPE postgres_scanner, READ_ONLY);
  SELECT table_schema, table_name FROM test.information_schema.tables LIMIT 10;
"

# 2. 重啟 OpenClaw gateway（讓新 Skill 生效）
openclaw --profile dench gateway restart

# 3. 在 DenchClaw 聊天測試
# 問：「<系統名稱>有哪些資料表？」
# 期望：AI 用 postgres_scanner 查詢 information_schema
```

---

## 連線方式

### 本地 PostgreSQL（Docker 或直接安裝）

```bash
duckdb -json ':memory:' "
  INSTALL postgres_scanner; LOAD postgres_scanner;
  ATTACH 'dbname=<DB_NAME> user=<USER> password=<PASS> host=localhost port=<PORT>'
  AS <alias> (TYPE postgres_scanner, READ_ONLY);
  <QUERY>
"
```

### 遠端 PostgreSQL（透過 SSH Tunnel）

```bash
# 先建立 SSH Tunnel（在背景執行）
ssh -f -N -L <LOCAL_PORT>:localhost:5432 <SSH_USER>@<REMOTE_IP> -i <SSH_KEY>

# 然後用 localhost:<LOCAL_PORT> 連接
duckdb -json ':memory:' "
  INSTALL postgres_scanner; LOAD postgres_scanner;
  ATTACH 'dbname=<DB_NAME> user=<USER> password=<PASS> host=localhost port=<LOCAL_PORT>'
  AS <alias> (TYPE postgres_scanner, READ_ONLY);
  <QUERY>
"
```

**範例 — 連接 AWS 上的 Y-CRM：**
```bash
ssh -f -N -L 15432:localhost:5432 ubuntu@<AWS_HOST_IP> -i ~/.ssh/y-crm-aws-key.pem
# 然後 port=15432 連接
```

### 多系統同時連接

```bash
duckdb -json ':memory:' "
  INSTALL postgres_scanner; LOAD postgres_scanner;

  -- 系統 A
  ATTACH 'dbname=ycrm user=postgres password=postgres host=localhost port=5432'
  AS ycrm (TYPE postgres_scanner, READ_ONLY);

  -- 系統 B
  ATTACH 'dbname=erp user=erp_user password=xxx host=localhost port=15433'
  AS erp (TYPE postgres_scanner, READ_ONLY);

  -- 跨系統 JOIN！
  SELECT y.*, e.*
  FROM ycrm.public.customer y
  JOIN erp.public.vendor e ON y.vendor_code = e.code;
"
```

---

## 「動態探查優先」設計原則

**核心理念：永遠不要假設外部系統的 schema — 先探查再查詢。**

這是 Y-CRM 整合中學到的最重要教訓。不同環境、不同租戶的 schema 可能完全不同。

### 探查流程模板

```sql
-- Step 1: 列出所有 schema
SELECT schema_name FROM <alias>.information_schema.schemata
WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
ORDER BY schema_name;

-- Step 2: 列出指定 schema 的所有表
SELECT table_name FROM <alias>.information_schema.tables
WHERE table_schema = '<SCHEMA>'
ORDER BY table_name;

-- Step 3: 列出表的欄位結構
SELECT column_name, data_type, is_nullable
FROM <alias>.information_schema.columns
WHERE table_schema = '<SCHEMA>' AND table_name = '<TABLE>'
ORDER BY ordinal_position;

-- Step 4: 取樣資料（了解實際內容格式）
SELECT * FROM <alias>.<SCHEMA>."<TABLE>" LIMIT 5;
```

### 為什麼不硬編碼 schema？

| 場景 | 問題 |
|------|------|
| ERP 升級改表結構 | 硬編碼的欄位名不存在 → 查詢失敗 |
| 不同客戶不同模組 | A 客戶有庫存模組，B 客戶沒有 |
| 自訂欄位 | 使用者自己加的欄位 AI 不知道 |
| 多租戶 | 每個租戶的 schema 可能不同 |

---

## Skill 內容設計指南

### 必要 section

| Section | 用途 | 範例 |
|---------|------|------|
| **Connection** | 連線字串模板 | `ATTACH 'dbname=...' AS erp` |
| **Query Workflow** | 動態探查步驟 | Step 1~4 的 SQL 模板 |
| **Safety Rules** | 安全規則 | READ_ONLY、跳過密碼欄位 |

### 建議 section

| Section | 用途 | 範例 |
|---------|------|------|
| Schema Structure | Schema 概覽圖 | 樹狀結構 |
| Column Naming | 欄位命名規則 | camelCase? snake_case? |
| Common Tables | 常見表參考 | 標注「僅供參考，需探查確認」 |
| REST API | 寫入操作 | curl 範例 |
| Important Notes | 特殊注意事項 | 軟刪除、JSON 欄位等 |

### 觸發關鍵字設計

在 IDENTITY.md 中定義 AI 何時應該使用此 Skill：

```markdown
- **CRITICAL**: When the user asks about <觸發關鍵字>，use this skill.
```

**Y-CRM 範例：** `Y-CRM, CRM, 系統, 成員, 客戶, 公司, 工作區`
**ERP 範例：** `ERP, 進銷存, 採購, 銷售, 庫存, 物料, BOM`
**WMS 範例：** `WMS, 倉庫, 儲位, 入庫, 出庫, 揀貨, 盤點`
**MES 範例：** `MES, 產線, 工單, 良率, 設備, 製程`

---

## 安全注意事項

### 必須遵守

1. **永遠使用 `READ_ONLY`** — postgres_scanner ATTACH 時加上 `READ_ONLY`
2. **永遠使用 `:memory:`** — 不要打開任何本地 .duckdb 檔案
3. **只允許 SELECT** — 在 Skill 中明確告訴 AI 只能 SELECT
4. **跳過敏感欄位** — 密碼、token、secret、OAuth credential 等
5. **LIMIT 結果** — 避免拉回過多資料

### 寫入安全

1. **永遠透過外部系統的 API** — 不要直接 SQL INSERT/UPDATE
2. **API Token 用環境變數** — 不要寫死在 Skill 中
3. **寫入前先查詢** — 避免重複建立
4. **寫入後確認** — 讀回資料驗證

---

## 常見系統整合參考

### ERP 系統（如 ERPNext / Odoo）

```yaml
---
name: erp-database
description: Query ERP data (orders, inventory, BOM) via postgres_scanner.
metadata: { "openclaw": { "always": true, "emoji": "🏭" } }
---
```

典型 schema：
- `public.tabSales Order` / `sale_order`（銷售訂單）
- `public.tabPurchase Order` / `purchase_order`（採購訂單）
- `public.tabItem` / `product_product`（物料/產品）
- `public.tabBOM` / `mrp_bom`（BOM 表）
- `public.tabStock Ledger Entry` / `stock_move`（庫存異動）

### WMS 系統

```yaml
---
name: wms-database
description: Query WMS data (locations, inventory, pick/pack) via postgres_scanner.
metadata: { "openclaw": { "always": true, "emoji": "📦" } }
---
```

典型 schema：
- `warehouse` / `location`（倉庫/儲位）
- `inventory` / `stock`（庫存）
- `inbound` / `receipt`（入庫）
- `outbound` / `shipment`（出庫）
- `pick_order` / `wave`（揀貨單/波次）

### MES 系統

```yaml
---
name: mes-database
description: Query MES data (work orders, equipment, yield) via postgres_scanner.
metadata: { "openclaw": { "always": true, "emoji": "⚙️" } }
---
```

典型 schema：
- `work_order`（工單）
- `equipment` / `machine`（設備）
- `defect` / `quality_inspection`（品質/缺陷）
- `production_log`（生產日誌）
- `bom` / `routing`（BOM/製程）

> **注意**：以上表名僅供參考。實際表名取決於你使用的具體 ERP/WMS/MES 軟體。永遠先用 `information_schema` 探查。

---

## 踩坑紀錄（Y-CRM 整合經驗，2026-04-09）

### 基礎問題

#### 1. Skill 放錯位置
**問題**：把 SKILL.md 放在 DenchClaw 原始碼目錄，但 Agent 讀的是 workspace 目錄。
**解法**：運行時路徑 `~/.openclaw-dench/workspace/skills/<name>/`，原始碼路徑 `/Users/ym/DenchClaw/skills/<name>/`，兩份保持同步。

#### 2. IDENTITY.md 沒更新
**問題**：新增了 Skill，但 IDENTITY.md 沒有提到，AI 不知道要用它。
**解法**：手動在 IDENTITY.md 加 contract section（OpenClaw 不會自動同步自訂 Skill）。

#### 3. Frontmatter 用了無效欄位
**問題**：用了 `inject: true`，Skill 沒被載入。
**解法**：`inject` 被 OpenClaw 完全忽略，用 `metadata: { "openclaw": { "always": true } }` 才正確。

#### 4. 假設表一定存在
**問題**：Skill 硬編碼「查詢 person 表」，但某些工作區沒有。
**解法**：「動態探查優先」— 永遠先查 information_schema，再寫查詢。

#### 5. 欄位名不加引號
**問題**：`SELECT firstName FROM ...` 失敗，PostgreSQL 預設小寫。
**解法**：永遠用雙引號包裹 camelCase 欄位：`SELECT "firstName" FROM ...`

#### 6. 忘記軟刪除過濾
**問題**：查詢結果包含已刪除的資料。
**解法**：永遠加 `WHERE "deletedAt" IS NULL`。

### OpenClaw Skill 載入機制問題

#### 7. Skill 內容不嵌入 System Prompt
**問題**：以為 SKILL.md 內容會直接注入 AI 的 system prompt，但實際上 OpenClaw 只注入索引（name + description + path），AI 必須主動用 `read` tool 載入 SKILL.md。
**影響**：小模型（Qwen 3.5、Gemma 4 E2B）經常跳過 read 步驟 → 不知道查詢規則 → 編造資料。
**解法**：把最關鍵的指令（duckdb 連線命令、禁止編造規則）直接寫在 IDENTITY.md 裡（一定會被 AI 看到）。SKILL.md 放完整的補充資訊。

#### 8. dench-identity 插件未安裝
**問題**：`dench-identity` 插件沒在 `openclaw.json` 的 plugins 中，AI 收不到 specialist roster。
**影響**：AI 不知道自己有哪些角色和技能。
**現況**：只有 `posthog-analytics` 和 `dench-ai-gateway` 被載入。需要手動添加或重新執行 `openclaw onboard`。

### AI 模型行為問題

#### 9. 小模型不主動讀 SKILL.md
**問題**：Qwen 3.5 9B / 4B / Gemma 4 E2B 經常不執行 `read` tool 載入 SKILL.md。
**解法**（按可靠度排序）：
1. 關鍵指令內嵌 IDENTITY.md（AI 一定看得到）
2. SKILL.md 最上方放強制規則（「禁止編造資料」）
3. 切換更強模型（GPT-4.1-mini / Claude Sonnet 會主動讀 skill files）

#### 10. 小模型編造資料
**問題**：模型跳過 DB 查詢，直接虛構 JSON 數據回覆。
**解法**：SKILL.md 第一條規則寫「絕對禁止編造資料」，IDENTITY.md 也寫。

#### 11. AI 回覆語言不一致
**問題**：模型用英文或簡體中文回覆。
**解法**：在 IDENTITY.md（不是只在 SKILL.md）加「一律使用繁體中文回覆」，因為 IDENTITY.md 直接嵌入 prompt。

#### 12. Ollama 模型推理卡死
**問題**：Qwen 3.5 的 thinking mode 會進入死循環，整個 Ollama 卡住，後續所有請求 timeout。
**症狀**：DenchClaw 顯示「Failed to fetch」。
**解法**：`pkill -9 ollama` 重啟，或直接用雲端 API（GPT-4.1-mini）避免此問題。

#### 13. maxTokens 設太小
**問題**：`openclaw.json` 中 `maxTokens: 8192`，thinking model 花大量 token 在思考，輸出到一半被截斷。
**症狀**：AI 回覆到一半停住。
**解法**：`maxTokens` 調高到 32768。

### 圖表輸出問題

#### 14. AI 不知道 report-json 格式
**問題**：SKILL.md 只提到「用 report-json 格式」但沒有範例，GPT-4.1-mini 不知道具體格式 → 說「請稍候」後就停住。
**解法**：在 SKILL.md 中直接嵌入完整的 report-json 範例（含 pie/bar/line/gauge 四種圖表類型 + mapping 格式），不要只引用 reference 文件。

### 環境問題

#### 15. Port 衝突（nanoclaw vs DenchClaw Web）
**問題**：nanoclaw（LINE webhook server）佔了 port 3100，DenchClaw Web 也預設 3100 → 啟動失敗 → 空白頁面。
**解法**：DenchClaw Web 改用 port 3200（`next dev --port 3200`）。

#### 16. nanoclaw 自動重啟
**問題**：nanoclaw 由 launchd（`com.nanoclaw`）管理，`KeepAlive: true`，殺掉會自動重啟。
**解法**：不要嘗試殺 nanoclaw，改用不同 port 啟動 DenchClaw Web。

---

## 防坑 Checklist（新系統整合前必讀）

整合新系統前，確認以下每一項都做到：

### SKILL.md 必須包含
- [ ] `metadata: { "openclaw": { "always": true } }`（不要用 inject）
- [ ] **「絕對禁止編造資料」**放在最上方
- [ ] **duckdb 連線命令**完整範例（可直接複製貼上）
- [ ] **report-json 圖表格式**完整範例（含 pie/bar/line mapping）
- [ ] **語言規則**：「一律使用繁體中文回覆」
- [ ] **動態探查 SQL**（information_schema 查表查欄位）
- [ ] **問題路由表**（什麼問題 → 做什麼動作）

### IDENTITY.md 必須包含
- [ ] 系統 contract section（觸發關鍵字 + skill 路徑）
- [ ] **duckdb 連線命令**（重複寫！確保小模型也看得到）
- [ ] **「禁止編造資料」**規則（重複寫！）
- [ ] **語言規則**（重複寫！IDENTITY.md 是直接嵌入 prompt 的）
- [ ] Default schema 名稱

### openclaw.json 確認
- [ ] `maxTokens` ≥ 32768（thinking model 需要更大空間）
- [ ] 模型設定正確（本地或雲端）

### 測試流程
- [ ] duckdb 連線測試通過
- [ ] **開新對話**測試（舊對話不載入新設定）
- [ ] 測試純文字查詢（AI 是否用 duckdb 查 DB）
- [ ] 測試圖表生成（AI 是否輸出 report-json）
- [ ] 測試語言（是否用繁體中文回覆）
- [ ] 換模型測試（至少測 GPT-4.1-mini + 一個本地模型）

---

## Checklist — 新增外部系統整合

- [ ] 建立 `~/.openclaw-dench/workspace/skills/<name>/SKILL.md`（基於模板）
- [ ] 備份到 `/Users/ym/DenchClaw/skills/<name>/SKILL.md`
- [ ] 更新 `~/.openclaw-dench/workspace/IDENTITY.md`（加 contract section）
- [ ] 設定連線（本地 PG 或 SSH Tunnel）
- [ ] 測試 postgres_scanner 連線
- [ ] 重啟 OpenClaw gateway
- [ ] 在 DenchClaw 聊天中驗證
- [ ] （選擇性）設定 REST API Token 環境變數
- [ ] （選擇性）更新 DenchClaw web 的 external-pg-query API route

---

## 多租戶隔離分析

> **目前採用方案 A（單一 Skill，動態探查所有工作區）。** 多租戶隔離留待 DenchClaw 更成熟後再實施。

### 現況：單一 Skill + 動態探查（方案 A）

目前 Y-CRM Skill 採用「動態探查優先」設計，AI 每次查詢前都先探查 `information_schema`：

```sql
SELECT id, "displayName", subdomain FROM ycrm.core.workspace
WHERE "deletedAt" IS NULL;
```

**優點：**
- Y-CRM 新增工作區 → 新 `workspace_xxx` schema 自動可見 → **零部署、零設定**
- 維護成本最低，不需為每個租戶建立獨立配置

**限制：**
- 同一個 DenchClaw 實例可以查詢所有工作區的資料
- 適合內部使用、信任的操作人員

### 未來：多租戶隔離方案

當需要「不同工作區（租戶）= 不同使用者，DB 資料互相不可見」時，有以下方案：

#### 方案 B：單 DenchClaw + 多 Workspace（軟隔離）

```
~/.openclaw-dench/
├── workspace/                    ← youngming 專用
│   └── skills/ycrm/SKILL.md     ← 只查 workspace_3joxkr9ofo5hlxjan164egffx
├── workspace-calleen/            ← calleen 專用
│   └── skills/ycrm/SKILL.md     ← 只查 workspace_407lopjyyvm7bxeutk1tvqkpo
├── workspace-hopet/              ← hopet 專用
│   └── skills/ycrm/SKILL.md     ← 只查 workspace_5sgeef4h8tfcbqihsmg9numuh
└── ...
```

- 利用 DenchClaw 內建的多 workspace 功能
- 每個 workspace 的 SKILL.md 鎖定查詢特定 Y-CRM schema
- AI 不知道其他 workspace 的 schema 名稱 → 軟隔離
- **限制**：同一台機器上的使用者可以切換 workspace

#### 方案 C：多 DenchClaw 容器（硬隔離）

```
Container 1 (youngming)          Container 2 (calleen)
├── Gateway :19001               ├── Gateway :19001
├── Web App :3100                ├── Web App :3100
└── SKILL.md (只查 youngming)    └── SKILL.md (只查 calleen)
    expose :3101                     expose :3102
```

- Docker 容器層面隔離，真正的多租戶
- 每個租戶獨立的 AI key / 配置
- **限制**：資源佔用大（N 個容器 × Node.js + Gateway），維護成本高

#### 方案 D：修改 DenchClaw 支援多 Profile（需改原始碼）

- DenchClaw 目前硬編碼 `DENCHCLAW_PROFILE = "dench"`
- 改為可配置後：`denchclaw --profile youngming` → `~/.openclaw-youngming/`
- 每個 profile 完全獨立
- **限制**：需 fork 維護 DenchClaw

#### 新增租戶的操作成本

| 方案 | 新增租戶時需要做什麼 |
|------|---------------------|
| A（現在） | **什麼都不用做** — 動態探查自動發現新工作區 |
| B | 建 workspace 目錄 + 複製修改 SKILL.md + 更新 IDENTITY.md + 重啟 Gateway |
| C | 建 Docker 容器 + 配置 SKILL.md + 分配 port |
| D | 建 profile + 配置所有檔案 + 啟動獨立 Gateway + Web |

**B/C/D 可透過自動化腳本降低成本**：Y-CRM 新增工作區時觸發 webhook → 自動建立 DenchClaw 配置。

### 建議路線

| 階段 | 方案 | 時機 |
|------|------|------|
| 現在 | **A（單一 Skill + 動態探查）** | DenchClaw 還在驗證階段 |
| 有外部使用者時 | B 或 C | 需要租戶資料隔離時 |
| 規模化部署 | D + C | DenchClaw 成熟 + 容器化 |
