# DenchClaw + Y-CRM 系統架構說明

## 目前架構總覽

```
┌──────────────────────────────────────────────────────────────────────┐
│                          使用者的瀏覽器                               │
├────────────────────────┬─────────────────────────────────────────────┤
│    DenchClaw Web UI    │              Y-CRM Web UI                   │
│    (localhost:3200)    │      (localhost:3001 / AWS:8866)             │
│    Next.js App         │      React 18 + Vite + Recoil               │
└───────────┬────────────┴──────────────────┬──────────────────────────┘
            │                               │
            │  AI 對話 + 工具呼叫            │  Apollo Client (GraphQL)
            │                               │  REST API (/rest/*)
            ▼                               ▼
┌────────────────────────┐      ┌──────────────────────────────────────┐
│    DenchClaw Agent     │      │          Y-CRM Backend               │
│    (OpenAI GPT)        │      │          (NestJS + GraphQL Yoga)      │
│                        │      │          localhost:3000 / AWS:8867    │
│  ┌──────────────────┐  │      ├──────────────────────────────────────┤
│  │ Tools            │  │      │  REST API     │  GraphQL API          │
│  │ • exec (指令)    │  │      │  /rest/*      │  /graphql             │
│  │ • web  (網路)    │  │      └───────────────┴──────────────────────┘
│  │ • read (讀檔)    │  │                          │
│  └────────┬─────────┘  │                          │ TypeORM
│           │             │                          ▼
│           │ exec tool   │      ┌──────────────────────────────────────┐
│           ▼             │      │                                      │
│  ┌──────────────────┐   │      │          PostgreSQL 16               │
│  │   DuckDB CLI     │   │      │          localhost:5432               │
│  │   (:memory:)     │   │      │          DB: default                  │
│  │                  │   │      ├──────────────────────────────────────┤
│  │  ┌────────────┐  │   │      │  core schema                         │
│  │  │ postgres_  │  │───┼──────│  ├── workspace (工作區)               │
│  │  │ scanner    │  │   │      │  ├── user (使用者) ⚠️ 跳過密碼欄位   │
│  │  │ (READ_ONLY)│  │   │      │  └── userWorkspace (使用者↔工作區)   │
│  │  └────────────┘  │   │      │                                      │
│  │                  │   │      │  workspace_3jox... (Y-CRM 主工作區)  │
│  │  ┌────────────┐  │   │      │  ├── person, company, opportunity    │
│  │  │ 未來擴充   │  │   │      │  ├── task, note, message             │
│  │  │ mysql_     │  │   │      │  └── _自訂物件 (_pet, _yeJiMuBiao)  │
│  │  │ scanner    │──┼───┼─ ─ ─ │                                      │
│  │  └────────────┘  │   │      │  workspace_407l... (Calleen公司)     │
│  └──────────────────┘   │      │  workspace_1g99... (HONG MING)      │
│                        │      │  ... 共 9 個工作區                    │
│  ┌──────────────────┐   │      └──────────────────────────────────────┘
│  │ Skills (SKILL.md)│   │                          │
│  │ • ycrm (已完成)  │   │                          │ Redis 7
│  │ • erp  (規劃中)  │   │                          ▼
│  │ • wms  (規劃中)  │   │      ┌──────────────────────────────────────┐
│  │ • mes  (規劃中)  │   │      │  Y-CRM Worker (背景任務)             │
│  └──────────────────┘   │      │  Email sync, Workflow, BullMQ        │
│                        │      └──────────────────────────────────────┘
│  ┌──────────────────┐   │
│  │ Extensions       │   │
│  │ • ai-gateway     │   │
│  │ • posthog        │   │
│  └──────────────────┘   │
│                        │
│  ┌──────────────────┐   │
│  │ REST API 寫入    │───┼────→ Y-CRM REST API (curl POST/PATCH/DELETE)
│  │ (透過 exec curl) │   │      localhost:3000/rest/*
│  └──────────────────┘   │
└────────────────────────┘
```

---

## DenchClaw 架構詳解

### 元件說明

| 元件 | 技術 | Port | 說明 |
|------|------|------|------|
| **Web UI** | Next.js (dev mode) | 3200 | 聊天介面，使用者與 AI 互動 |
| **AI Agent** | OpenAI GPT-4.1-mini | — | 理解自然語言，決定呼叫哪些工具 |
| **DuckDB** | DuckDB CLI (:memory:) | — | **關鍵橋樑** — 透過 scanner 擴充連接外部資料庫 |
| **Tools** | exec, web, read 等 | — | Agent 的「手腳」，執行查詢/API 呼叫 |
| **Skills** | SKILL.md 文件 | — | 教 AI 如何操作特定系統的指令手冊 |
| **Extensions** | JS plugins | — | 插件系統（AI gateway、分析追蹤） |
| **Identity** | IDENTITY.md | — | AI 的身份合約，定義能力與限制 |

### DuckDB 的核心角色

DuckDB 是 DenchClaw 連接外部資料庫的**關鍵中間層**：

```
DenchClaw Agent
    │
    │ exec tool（執行 duckdb CLI 指令）
    ▼
┌─────────────────────────────────────────┐
│              DuckDB (:memory:)           │
│                                         │
│  INSTALL postgres_scanner;              │
│  LOAD postgres_scanner;                 │
│  ATTACH 'dbname=default               │
│    user=postgres password=postgres      │
│    host=localhost port=5432'            │
│  AS ycrm (TYPE postgres_scanner,        │
│           READ_ONLY);                   │
│                                         │
│  SELECT * FROM ycrm.core.workspace;     │
└─────────────────────────────────────────┘
           │
           │ postgres_scanner（唯讀連線）
           ▼
    PostgreSQL（Y-CRM 資料庫）
```

**為什麼用 DuckDB 而不是直接 psql？**

| 優勢 | 說明 |
|------|------|
| **安全** | `:memory:` + `READ_ONLY` 確保不會意外寫入 |
| **跨資料庫** | 同一個查詢可 JOIN 不同來源（PostgreSQL + MySQL + SQLite） |
| **輕量** | 無需安裝 client，CLI 即可執行 |
| **擴充性** | 未來加 ERP（MySQL）只需 `INSTALL mysql_scanner` |
| **JSON 輸出** | `-json` 參數直接輸出 JSON，方便 AI 解析 |

### Skill 系統運作方式

```
/Users/ym/DenchClaw/skills/          ← 原始碼（開發用）
    ├── _TEMPLATE/
    │   ├── SKILL.md                 ← Skill 模板
    │   ├── IDENTITY_CONTRACT.md     ← 身份合約模板
    │   └── EXAMPLE_ERP_SKILL.md     ← ERP 整合範例
    └── ycrm/
        └── SKILL.md                 ← Y-CRM 整合 Skill

~/.openclaw-dench/workspace/skills/  ← 運行時路徑（DenchClaw 實際讀取）
    └── ycrm/
        └── SKILL.md                 ← 同步自上方
```

每個 Skill 的 SKILL.md 包含：
1. **Frontmatter** — `metadata: { "openclaw": { "always": true } }` 表示始終載入
2. **連線方式** — DuckDB 指令或 API endpoint
3. **探查流程** — 先查 information_schema 再寫查詢（動態探查優先）
4. **查詢範例** — 常見操作的 SQL / curl 範例
5. **安全規則** — READ_ONLY、跳過敏感欄位、soft delete filter

### 設定檔結構

```
~/.openclaw-dench/
├── openclaw.json              ← 主設定（模型、工具權限、gateway）
├── workspace/
│   ├── IDENTITY.md            ← AI 身份合約
│   ├── workspace.duckdb       ← DenchClaw 自身的本地資料庫（非 Y-CRM）
│   └── skills/
│       └── ycrm/SKILL.md     ← Y-CRM 整合指令
├── identity/                  ← 身份相關設定
├── devices/                   ← 裝置設定
└── extensions/
    ├── dench-ai-gateway/      ← AI Gateway 插件
    └── posthog-analytics/     ← 分析追蹤插件
```

---

## Y-CRM 架構詳解

### 技術堆疊

| 層 | 技術 | 說明 |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite | SPA 應用 |
| **狀態管理** | Recoil (atoms, selectors) | 全域狀態 |
| **API 通訊** | Apollo Client (GraphQL) | 前端↔後端 |
| **樣式** | Emotion (styled-components) | CSS-in-JS |
| **後端** | NestJS + TypeORM | 業務邏輯 + ORM |
| **API** | GraphQL Yoga + REST | 雙軌 API |
| **資料庫** | PostgreSQL 16 | 多租戶 schema |
| **佇列** | Redis 7 + BullMQ | 背景任務 |
| **i18n** | Lingui | 多語系（zh-TW 為主） |

### Monorepo 結構

```
twenty-ym/
├── packages/
│   ├── twenty-front/          ← React 前端
│   ├── twenty-server/         ← NestJS 後端 API + Worker
│   ├── twenty-ui/             ← 共用 UI 元件庫
│   ├── twenty-shared/         ← 共用型別與工具
│   ├── twenty-emails/         ← Email 模板
│   └── twenty-e2e-testing/    ← Playwright E2E 測試
├── docker/
│   └── dev-flow/
│       └── aws/               ← AWS 部署腳本
└── docs/                      ← 文件
```

### 多工作區（Multi-tenant）設計

Y-CRM 採用 **schema-per-workspace** 多租戶架構：

```
PostgreSQL (database: default)
│
├── core schema                          ← 系統共用
│   ├── workspace    (id, displayName, subdomain)
│   ├── user         (id, firstName, lastName, email)
│   └── userWorkspace (userId ↔ workspaceId)
│
├── workspace_3joxkr9ofo5hlxjan164egffx  ← Y-CRM 主工作區 (youngming)
│   ├── 標準物件：person, company, opportunity, task, note...
│   ├── 自訂物件：_pet, _yeJiMuBiao...（前綴 _）
│   └── 系統表：workspaceMember, favorite, workflow...
│
├── workspace_407lopjyyvm7bxeutk1tvqkpo  ← Calleen公司
├── workspace_1g99wpzrdddsuiagn4k5gsecx  ← HONG MING
├── workspace_5sgeef4h8tfcbqihsmg9numuh  ← HOPET
├── workspace_1f50bssxzvj2lwap2po8xu7cn  ← HUYNH
├── workspace_39f8dylknizhkvjmva16w79r5  ← OOCHAIN
├── workspace_4k895h39wihc4g84axid1ggzi  ← Vivian測試
├── workspace_ah8oi06oyuo29ry1ikb89iu96  ← 德佟電子科技
└── workspace_2c96vz4nsg10zwua9xejof4m   ← 鹿氏
```

**每個工作區可以有不同的自訂物件和欄位配置。**

### API 介面

| 類型 | 路徑 | 用途 | 認證 |
|------|------|------|------|
| **GraphQL** | `/graphql` | 前端主要使用，完整 CRUD | JWT Token |
| **REST** | `/rest/people` | 外部整合，支援 filter/sort | Bearer Token |
| **REST** | `/rest/companies` | 公司 CRUD | Bearer Token |
| **REST** | `/rest/opportunities` | 商機 CRUD | Bearer Token |
| **REST** | `/rest/<custom>` | 自訂物件 | Bearer Token |

### 部署架構

```
本地開發                              AWS 生產環境
─────────                            ──────────────
Frontend  :3001 (Vite dev)           Frontend  :8866 (Nginx)
Backend   :3000 (NestJS)             Backend   :8867 (NestJS)
PostgreSQL:5432 (Docker)             PostgreSQL:5432 (Docker)
Redis     :6379 (Docker)             Redis     :6379 (Docker)
                                     Worker    (Docker)
                                     IP: 18.178.180.71
```

---

## DenchClaw ↔ Y-CRM 資料流

### 讀取流程（查詢）

```
使用者：「幫我查 Y-CRM 裡姓王的客戶」
         │
         ▼
DenchClaw Agent（GPT-4.1-mini）
  │
  │ 讀取 ycrm/SKILL.md → 知道怎麼連 Y-CRM
  │
  │ Step 1: exec tool → duckdb 查 information_schema（探查表結構）
  │ Step 2: exec tool → duckdb SELECT 查詢（帶 deletedAt IS NULL）
  │
  ▼
DuckDB (:memory:, postgres_scanner, READ_ONLY)
  │
  │ SQL 查詢
  ▼
PostgreSQL (Y-CRM)
  │
  │ 回傳 JSON 結果
  ▼
DenchClaw Agent → 整理結果 → 回覆使用者
```

### 寫入流程（新增/修改/刪除）

```
使用者：「幫我新增一個客戶 王小明」
         │
         ▼
DenchClaw Agent
  │
  │ Step 1: DuckDB 查詢確認無重複
  │ Step 2: DuckDB 查詢 companyId 等外鍵
  │ Step 3: exec tool → curl POST Y-CRM REST API
  │ Step 4: DuckDB 查詢確認寫入成功
  │
  ▼
curl -X POST http://localhost:3000/rest/people \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"name":{"firstName":"小明","lastName":"王"}}'
```

---

## 未來擴充：串接 ERP / WMS / MES

### 擴充架構圖

```
                    DenchClaw Agent (GPT-4.1-mini)
                           │
              ┌────────────┼────────────┬────────────┐
              │            │            │            │
              ▼            ▼            ▼            ▼
         ycrm Skill   erp Skill   wms Skill   mes Skill
              │            │            │            │
              ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────┐
│                    DuckDB (:memory:)                     │
│                                                         │
│  ATTACH ycrm  (postgres_scanner → PostgreSQL:5432)      │
│  ATTACH erp   (postgres_scanner → PostgreSQL:5433)      │
│  ATTACH wms   (mysql_scanner    → MySQL:3306)           │
│  ATTACH mes   (透過 REST API，不直連 DB)                 │
│                                                         │
│  ── 跨系統 JOIN 查詢 ──                                  │
│  SELECT c.name, o.order_no, s.ship_date                 │
│  FROM ycrm.workspace_xxx.company c                      │
│  JOIN erp.public.orders o ON c.erp_id = o.customer_id   │
│  JOIN wms.inventory.shipments s ON o.id = s.order_id    │
└─────────────────────────────────────────────────────────┘
```

### 串接步驟

| 步驟 | 動作 | 說明 |
|------|------|------|
| 1 | 確認連線方式 | DB 直連（最佳）或 API only |
| 2 | 建立 `skills/<系統>/SKILL.md` | 連線資訊 + 表結構 + 查詢範例 + 安全規則 |
| 3 | 同步到 runtime 路徑 | 複製到 `~/.openclaw-dench/workspace/skills/` |
| 4 | 更新 `IDENTITY.md` | 加入 contract section 宣告新能力 |
| 5 | 重啟 DenchClaw | 載入新 Skill |
| 6 | 測試對話 | 驗證查詢/寫入正常 |

### DuckDB Scanner 支援

| Scanner | 適用資料庫 | 安裝指令 |
|---------|-----------|---------|
| `postgres_scanner` | PostgreSQL | `INSTALL postgres_scanner;` |
| `mysql_scanner` | MySQL / MariaDB | `INSTALL mysql_scanner;` |
| `sqlite_scanner` | SQLite | `INSTALL sqlite_scanner;` |
| ODBC | SQL Server / Oracle | 需額外設定 ODBC driver |

---

## 重要安全規則

| 規則 | 說明 |
|------|------|
| `:memory:` | DuckDB 永遠使用記憶體模式，不存檔 |
| `READ_ONLY` | Scanner 連線永遠唯讀 |
| 跳過敏感欄位 | `passwordHash`, tokens, secrets 等 |
| `deletedAt IS NULL` | Y-CRM 使用 soft delete，查詢必須過濾 |
| Bearer Token | REST API 寫入需認證 |
| 動態探查優先 | 永遠先查 `information_schema` 再寫查詢 |

---

## 環境資訊

### 本地開發

| 服務 | Port | 說明 |
|------|------|------|
| DenchClaw Web | 3200 | Next.js dev mode |
| Y-CRM Frontend | 3001 | Vite dev server |
| Y-CRM Backend | 3000 | NestJS |
| PostgreSQL | 5432 | Docker container |
| Redis | 6379 | Docker container |

### AWS 生產

| 服務 | Port | 說明 |
|------|------|------|
| Y-CRM Frontend | 8866 | Nginx (Docker) |
| Y-CRM Backend | 8867 | NestJS (Docker) |
| PostgreSQL | 5432 | Docker container |
| Redis | 6379 | Docker container |
| IP | 18.178.180.71 | — |

**注意**：DenchClaw 不部署在 AWS 上，只在使用者本地電腦運行。當使用者透過瀏覽器存取 AWS Y-CRM 時，DenchClaw 仍連接本地 PostgreSQL（非 AWS 資料庫）。
