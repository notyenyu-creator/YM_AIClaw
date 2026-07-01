# DenchClaw + Y-CRM 系統架構說明

> 延伸準則請一併參考：
> [DenchClaw_跨系統串接與Agent設計原則.md](/Users/ym/DenchClaw/docs/DenchClaw_跨系統串接與Agent設計原則.md)
>
> 工程檢查清單：
> [DenchClaw_系統串接工程檢查清單.md](/Users/ym/DenchClaw/docs/DenchClaw_系統串接工程檢查清單.md)
>
> 工程流程與多 Agent 驗收標準：
> [DenchClaw_工程流程與多Agent驗收標準.md](/Users/ym/DenchClaw/docs/DenchClaw_工程流程與多Agent驗收標準.md)
>
> 架構邊界：本文件描述目前 DenchClaw 的受控 domain runtime 路線；不引入第二套 runtime，不改 OpenClaw Gateway + Hermes-style orchestration + AI Wiki，也不改既有 8 大核心。

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
│    DenchClaw Runtime   │      │          Y-CRM Backend               │
│ Gateway + Domain Flow  │      │          (NestJS + GraphQL Yoga)      │
│                        │      │          localhost:3000 / AWS:8867    │
│  ┌──────────────────┐  │      ├──────────────────────────────────────┤
│  │ Domain Pipeline  │  │      │  REST API     │  GraphQL API          │
│  │ • planner        │  │      │  /rest/*      │  /graphql             │
│  │ • context builder│  │      └───────────────┴──────────────────────┘
│  │ • verified query │  │                          │
│  └────────┬─────────┘  │                          │ TypeORM
│           │             │                          ▼
│           │ server-side │      ┌──────────────────────────────────────┐
│           ▼             │      │                                      │
│  ┌──────────────────┐   │      │          PostgreSQL 16               │
│  │ Domain Adapter   │   │      │          localhost:5432               │
│  │ server-side only │   │      │          DB: default                  │
│  │                  │   │      ├──────────────────────────────────────┤
│  │  ┌────────────┐  │   │      │  core schema                         │
│  │  │ DB/API     │  │───┼──────│  ├── workspace (工作區)               │
│  │  │ adapter    │  │   │      │  ├── user (使用者) ⚠️ 跳過密碼欄位   │
│  │  │ READ_ONLY  │  │   │      │  └── userWorkspace (使用者↔工作區)   │
│  │  └────────────┘  │   │      │                                      │
│  │                  │   │      │  workspace_3jox... (Y-CRM 主工作區)  │
│  │  ┌────────────┐  │   │      │  ├── person, company, opportunity    │
│  │  │ 未來擴充   │  │   │      │  ├── task, note, message             │
│  │  │ future     │  │   │      │  └── _自訂物件 (_pet, _yeJiMuBiao)  │
│  │  │ adapters   │──┼───┼─ ─ ─ │                                      │
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
│  │ Guarded API 寫入 │───┼────→ Y-CRM REST API (server-side POST/PATCH/DELETE)
│  │ (control bridge) │   │      localhost:3000/rest/*
│  └──────────────────┘   │
└────────────────────────┘
```

---

## DenchClaw 架構詳解

### 元件說明

| 元件 | 技術 | Port | 說明 |
|------|------|------|------|
| **Web UI** | Next.js (dev mode) | 3200 | 聊天介面，使用者與 AI 互動 |
| **Domain Runtime** | OpenClaw Gateway + Hermes-style flow | — | planner、context builder、context pack、verified query、chart guardrail、wiki review |
| **Model Layer** | gpt-4.1-mini / GX10 Router | — | 理解自然語言與生成回覆，但不直接持有 DB secret |
| **Server-side Adapters** | DuckDB / API client / future adapters | — | 在後端受控環境讀取 env secret，執行唯讀查詢或 guarded API |
| **Tools** | exec, web, read 等 | — | 只在受控流程內使用，不作為 AI 直連 DB 的公開入口 |
| **Skills** | SKILL.md 文件 | — | 定義 domain 規則、資料邊界、問題路由與安全注意事項 |
| **Extensions** | JS plugins | — | 插件系統（AI gateway、分析追蹤） |
| **Identity** | IDENTITY.md | — | AI 的身份合約，定義能力與限制 |

### Server-side Adapter 的核心角色

DuckDB 可以作為後端受控 adapter 之一，但正式邊界不是「AI 直接執行 DuckDB」。正確路徑是：

```
使用者問題
    │
    ▼
OpenClaw Gateway
    │
    ▼
Hermes-style planner / context builder
    │
    ▼
Domain verified direct query
    │
    ▼
Server-side adapter（DuckDB / API client / future adapter）
    │
    ▼
外部系統資料來源
```

重點：

- DB host、user、password、token 只存在 server-side env。
- Skill、IDENTITY、report-json、client request 不攜帶 raw connection string。
- DuckDB / postgres_scanner 是 adapter implementation detail，不是 AI prompt contract。
- 未來 WMS / MES / RFID / EMS 可改用 REST、MSSQL、Timescale、MQTT/OPC-UA 或 vendor API adapter。

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
1. **Frontmatter** — `metadata: { "openclaw": { "always": true } }` 表示 skill 索引始終可見，完整內容仍需 runtime / read flow 載入
2. **資料入口邊界** — domain adapter、server-side adapter config 或受控 API endpoint
3. **探查流程** — 由 context builder / verified query 讀取 schema 與代表資料
4. **查詢範例** — 常見操作的 query template / API action template，不包含 secret 或 raw connection string
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
DenchClaw Runtime（OpenClaw Gateway + Hermes-style flow）
  │
  │ planner 判斷 domain = Y-CRM
  │ context builder / context pack 確認 schema、時間窗、資料限制
  │ verified direct query 透過 server-side adapter 唯讀查詢
  │
  ▼
Y-CRM domain adapter（server-side only, READ_ONLY）
  │
  │ 受控查詢，不暴露 DB secret 給 prompt/client/report-json
  ▼
PostgreSQL (Y-CRM)
  │
  │ 回傳 JSON 結果
  ▼
DenchClaw Runtime → 文字回答 / verified rows / chart guardrail / learning draft
```

### 寫入流程（新增/修改/刪除）

```
使用者：「幫我新增一個客戶 王小明」
         │
         ▼
DenchClaw Runtime
  │
  │ Step 1: verified query 確認無重複
  │ Step 2: context builder 確認 companyId 等外鍵
  │ Step 3: guarded API / control bridge 執行寫入
  │ Step 4: verified query 確認寫入成功
  │
  ▼
Y-CRM guarded API
  POST /rest/people
  Authorization token 由 server-side runtime 注入，不出現在 prompt
```

---

## 未來擴充：串接 ERP / WMS / MES / RFID / EMS

### 擴充架構圖

```
                    DenchClaw Runtime
          (OpenClaw Gateway + Hermes-style flow)
                           │
              ┌────────────┼────────────┬────────────┐
              │            │            │            │
              ▼            ▼            ▼            ▼
         ycrm Skill   erp Skill   wms Skill   mes/rfid/ems Skill
              │            │            │            │
              ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────┐
│              Domain adapters（server-side only）         │
│                                                         │
│  ycrm adapter → PostgreSQL（server-side env）            │
│  erp adapter  → DB / API（server-side env）              │
│  wms adapter  → DB / API / vendor connector             │
│  mes adapter  → REST / MQTT / OPC-UA / vendor API       │
│                                                         │
│  跨系統問題由 planner 標記 cross-system，                │
│  各 domain adapter 分別查詢後，由 context pack 彙整，     │
│  不讓 skill 直接寫跨 DB JOIN 或攜帶 raw connection。       │
└─────────────────────────────────────────────────────────┘
```

### 串接步驟

| 步驟 | 動作 | 說明 |
|------|------|------|
| 1 | 確認 adapter 方式 | PostgreSQL 只是其中一種；也可為 REST、MSSQL、Timescale、MQTT/OPC-UA 或 vendor API |
| 2 | 建立 `skills/<系統>/SKILL.md` | domain 規則 + 資料邊界 + context builder / verified query 指引 + 安全規則 |
| 3 | 同步到 runtime 路徑 | 複製到 `~/.openclaw-dench/workspace/skills/` |
| 4 | 更新 `IDENTITY.md` | 加入 contract section 宣告新能力 |
| 5 | 重啟 DenchClaw | 載入新 Skill |
| 6 | 測試對話 | 驗證 domain pipeline、cross-domain guard、chart guardrail、model/source badge 與 wiki review |

### Adapter 支援

| Adapter 類型 | 適用來源 | 說明 |
|---------|-----------|---------|
| DuckDB scanner | PostgreSQL / MySQL / SQLite | 只在 server-side runtime 內使用，不放入 prompt contract |
| ODBC / native driver | SQL Server / Oracle | 由後端 adapter 管理 driver 與 secret |
| REST / vendor API | ERP / WMS / MES / EMS | 透過 guarded API client 與權限檢查 |
| MQTT / OPC-UA | RFID / OT / 設備資料 | 透過 domain adapter 或 control bridge，需額外安全 gate |

---

## 重要安全規則

| 規則 | 說明 |
|------|------|
| server-side env | DB / API secret 只存在後端 runtime，不進 prompt、client request 或 report-json |
| `READ_ONLY` | 查詢 adapter 預設唯讀；寫入/控制走 guarded API / control bridge |
| 跳過敏感欄位 | `passwordHash`, tokens, secrets 等 |
| soft-delete filter | 若該 domain schema 有 soft-delete 欄位，依 schema 探查結果套用 |
| Bearer Token | REST API 寫入需由 server-side runtime 注入 |
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
