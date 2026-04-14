# DenchClaw ↔ OpenClaw ↔ Y-CRM Skill 架構流程圖

> 產生日期：2026-04-09

## 1. 整體服務架構

```mermaid
graph TB
    subgraph User["👤 使用者瀏覽器"]
        Browser["瀏覽器"]
    end

    subgraph DenchClaw["DenchClaw (本地服務)"]
        Web["DenchClaw Web<br/>Next.js :3100"]
        Gateway["OpenClaw Gateway<br/>Node.js :19001"]

        subgraph Plugins["已載入插件"]
            PH["posthog-analytics"]
            AGW["dench-ai-gateway"]
        end

        subgraph Workspace["~/.openclaw-dench/workspace/"]
            Identity["IDENTITY.md<br/>（系統身分設定）"]
            subgraph Skills["skills/"]
                YCRM["ycrm/SKILL.md<br/>（Y-CRM 智慧助手）"]
                OtherSkill["其他 skill/SKILL.md"]
            end
        end
    end

    subgraph LLM["語言模型"]
        Ollama["Ollama :11434<br/>Qwen 3.5 9B"]
        OpenAI["OpenAI API<br/>GPT-4.1-mini"]
    end

    subgraph YCRM_System["Y-CRM 系統"]
        FE["Y-CRM 前端<br/>React :3001 / :8866"]
        BE["Y-CRM 後端<br/>NestJS :3000 / :8867"]
        PG[("PostgreSQL :5432<br/>DB: default")]
        RD[("Redis :6379")]
    end

    Browser -->|HTTP| Web
    Web -->|WebSocket/API| Gateway
    Gateway -->|插件 hook| Plugins
    Gateway -->|讀取| Identity
    Gateway -->|掃描| Skills
    Gateway -->|Chat Completion API| Ollama
    Gateway -.->|備用| OpenAI

    Ollama -->|tool: exec duckdb| PG
    Ollama -->|tool: read| YCRM
    Ollama -->|tool: exec curl| BE

    BE --> PG
    BE --> RD
    FE --> BE

    style YCRM fill:#ff9,stroke:#f90,stroke-width:2px
    style Identity fill:#ff9,stroke:#f90,stroke-width:2px
    style Gateway fill:#9cf,stroke:#36f,stroke-width:2px
    style Ollama fill:#c9f,stroke:#93f,stroke-width:2px
```

## 2. System Prompt 組裝流程

```mermaid
flowchart TD
    Start["每次新對話 / Prompt Build"] --> S1

    S1["1️⃣ OpenClaw 內建 Base System Prompt<br/>（通用 AI 助手指令）"]
    S1 --> S2

    S2["2️⃣ 讀取 IDENTITY.md<br/>（~/.openclaw-dench/workspace/IDENTITY.md）"]
    S2 --> S3

    S3["3️⃣ 掃描 workspace/skills/<br/>（每個子目錄的 SKILL.md）"]
    S3 --> S3a

    S3a["解析 Frontmatter<br/>resolveOpenClawMetadata()"]
    S3a --> S3b

    S3b{"資格判斷<br/>evaluateRuntimeEligibility()"}
    S3b -->|OS 不符| Exclude["排除"]
    S3b -->|always: true| Include["納入"]
    S3b -->|有 requires 且不滿足| Exclude
    S3b -->|無 requires / requires 滿足| Include

    Include --> S3c["formatSkillsForPrompt()<br/>產生 XML 清單"]

    S3c --> S4["4️⃣ 執行 Plugins Hook<br/>（before_prompt_build）"]

    S4 --> Final["最終 System Prompt 送給 LLM"]

    subgraph XML_Output["XML 格式（只有索引，不嵌入內容）"]
        XML["&lt;available_skills&gt;<br/>&lt;skill&gt;<br/>  &lt;name&gt;ycrm-database&lt;/name&gt;<br/>  &lt;description&gt;Y-CRM 產品智慧助手...&lt;/description&gt;<br/>  &lt;location&gt;/path/to/SKILL.md&lt;/location&gt;<br/>&lt;/skill&gt;<br/>&lt;/available_skills&gt;"]
    end
    S3c -.-> XML_Output

    style S1 fill:#e8f4fd,stroke:#2196F3
    style S2 fill:#fff3e0,stroke:#FF9800
    style S3c fill:#e8f5e9,stroke:#4CAF50
    style S4 fill:#fce4ec,stroke:#E91E63
    style Final fill:#f3e5f5,stroke:#9C27B0,stroke-width:3px
    style Exclude fill:#ffcdd2,stroke:#f44336
    style Include fill:#c8e6c9,stroke:#4CAF50
```

## 3. Skill 載入詳細邏輯

```mermaid
flowchart LR
    Scan["掃描<br/>~/.openclaw-dench/<br/>workspace/skills/"]
    Scan --> Dir1["ycrm/"]
    Scan --> Dir2["crm/"]
    Scan --> DirN["...其他/"]

    Dir1 --> Read1["讀取 SKILL.md"]
    Dir2 --> Read2["讀取 SKILL.md"]

    Read1 --> FM1["解析 Frontmatter"]
    Read2 --> FM2["解析 Frontmatter"]

    subgraph Frontmatter["Frontmatter 提取欄位"]
        direction TB
        F1["always ✅ (boolean)"]
        F2["emoji, homepage"]
        F3["skillKey, primaryEnv"]
        F4["os, requires, install"]
        F5["inject ❌ 被忽略"]
    end

    FM1 --> Check1{"資格判斷"}
    FM2 --> Check2{"資格判斷"}

    Check1 -->|always: true| Pass1["✅ 通過"]
    Check2 -->|always: true| Pass2["✅ 通過"]

    Pass1 --> Format["formatSkillsForPrompt()"]
    Pass2 --> Format

    Format --> Prompt["注入 System Prompt<br/>（僅 name + description + path）"]

    style F5 fill:#ffcdd2,stroke:#f44336
    style F1 fill:#c8e6c9,stroke:#4CAF50
    style Prompt fill:#e8f4fd,stroke:#2196F3,stroke-width:2px
```

## 4. AI 執行 Y-CRM 查詢流程

```mermaid
sequenceDiagram
    actor User as 使用者
    participant Web as DenchClaw Web<br/>:3100
    participant GW as OpenClaw Gateway<br/>:19001
    participant LLM as Ollama / GPT<br/>:11434
    participant Skill as SKILL.md<br/>(本地檔案)
    participant DuckDB as DuckDB<br/>(臨時程序)
    participant PG as PostgreSQL<br/>:5432
    participant API as Y-CRM REST API<br/>:3000

    User->>Web: 「畫一個商機階段分佈圖」
    Web->>GW: 轉發訊息
    GW->>GW: 組裝 System Prompt<br/>(Base + IDENTITY + Skills XML)
    GW->>LLM: Chat Completion 請求

    Note over LLM: AI 看到 <available_skills><br/>裡有 ycrm-database

    LLM->>Skill: tool: read SKILL.md
    Skill-->>LLM: 回傳完整 Skill 內容<br/>(DB 連線指令、表結構、規則)

    Note over LLM: AI 理解查詢規則：<br/>1. 禁止編造資料<br/>2. 用 duckdb postgres_scanner<br/>3. DB 已預設連線

    LLM->>DuckDB: tool: exec duckdb 命令
    DuckDB->>PG: postgres_scanner<br/>SELECT (READ_ONLY)
    PG-->>DuckDB: 查詢結果
    DuckDB-->>LLM: JSON 結果

    Note over LLM: AI 收到真實資料後<br/>用 report-json 格式輸出圖表

    LLM-->>GW: 回應（含圖表 JSON）
    GW-->>Web: 回傳
    Web-->>User: 渲染圖表

    rect rgb(255, 240, 240)
        Note over LLM,API: 寫入操作（新增/修改/刪除）走 REST API
        LLM->>API: tool: exec curl POST/PATCH/DELETE
        API->>PG: TypeORM 寫入
        PG-->>API: 結果
        API-->>LLM: REST Response
    end
```

## 5. 服務連線總覽

```
┌─────────────────────────────────────────────────────────────┐
│                    使用者電腦 (localhost)                       │
│                                                             │
│  ┌──────────────┐     ┌──────────────────┐                  │
│  │ DenchClaw Web│────▶│ OpenClaw Gateway  │                  │
│  │   :3100      │     │   :19001          │                  │
│  └──────────────┘     └────────┬─────────┘                  │
│                                │                             │
│                    ┌───────────┼───────────┐                 │
│                    ▼           ▼           ▼                 │
│            ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│            │ Ollama   │ │ IDENTITY │ │ Skills   │           │
│            │ :11434   │ │ .md      │ │ (SKILL   │           │
│            │ Qwen 3.5 │ │          │ │  .md)    │           │
│            └────┬─────┘ └──────────┘ └──────────┘           │
│                 │                                            │
│      ┌──────────┼──────────────────────────┐                 │
│      │          │     AI Tool 呼叫          │                 │
│      │   ┌──────▼──────┐  ┌──────────────┐ │                 │
│      │   │ DuckDB      │  │ curl         │ │                 │
│      │   │ (postgres_  │  │ (REST API)   │ │                 │
│      │   │  scanner)   │  │              │ │                 │
│      │   └──────┬──────┘  └──────┬───────┘ │                 │
│      └──────────┼────────────────┼─────────┘                 │
│                 │                │                            │
│                 ▼                ▼                            │
│  ┌────────────────────────────────────────────┐              │
│  │           Y-CRM 系統                        │              │
│  │  ┌────────────┐  ┌────────────┐            │              │
│  │  │ PostgreSQL │  │ NestJS API │            │              │
│  │  │ :5432      │  │ :3000      │            │              │
│  │  │ DB:default │  │ (REST+GQL) │            │              │
│  │  └────────────┘  └────────────┘            │              │
│  │  ┌────────────┐  ┌────────────┐            │              │
│  │  │ Redis      │  │ React 前端  │            │              │
│  │  │ :6379      │  │ :3001      │            │              │
│  │  └────────────┘  └────────────┘            │              │
│  └────────────────────────────────────────────┘              │
│                                                              │
│  ┌────────────────────────────────────────────┐              │
│  │  ⚠️ 關鍵限制                                │              │
│  │  • 所有服務都在 localhost，無外部連線          │              │
│  │  • DuckDB 用 READ_ONLY 連 PG（不可寫入）     │              │
│  │  • 寫入只能透過 REST API（curl）              │              │
│  │  • SKILL.md 不嵌入 prompt，AI 需主動 read    │              │
│  └────────────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────────┘
```

## 6. 未來整合新系統的擴展點

```mermaid
graph TB
    subgraph Gateway["OpenClaw Gateway"]
        Prompt["System Prompt 組裝"]
    end

    subgraph Skills["~/.openclaw-dench/workspace/skills/"]
        YCRM["✅ ycrm/<br/>SKILL.md"]
        ERP["🔜 erp/<br/>SKILL.md"]
        MES["🔜 mes/<br/>SKILL.md"]
        WMS["🔜 wms/<br/>SKILL.md"]
        RFID["🔜 rfid/<br/>SKILL.md"]
    end

    subgraph Identity["IDENTITY.md"]
        Contract["Contract Section<br/>（每個系統的關鍵查詢指令）"]
    end

    subgraph DBs["各系統資料庫"]
        PG_YCRM[("Y-CRM<br/>PG :5432")]
        PG_ERP[("ERP DB<br/>待定")]
        PG_MES[("MES DB<br/>待定")]
        PG_WMS[("WMS DB<br/>待定")]
    end

    Prompt --> YCRM
    Prompt --> ERP
    Prompt --> MES
    Prompt --> WMS
    Prompt --> RFID
    Prompt --> Identity

    YCRM -.->|duckdb| PG_YCRM
    ERP -.->|duckdb| PG_ERP
    MES -.->|duckdb| PG_MES
    WMS -.->|duckdb| PG_WMS

    style YCRM fill:#c8e6c9,stroke:#4CAF50,stroke-width:2px
    style ERP fill:#fff9c4,stroke:#FFC107
    style MES fill:#fff9c4,stroke:#FFC107
    style WMS fill:#fff9c4,stroke:#FFC107
    style RFID fill:#fff9c4,stroke:#FFC107
```

### 新增系統 Skill 步驟

1. 建立 `~/.openclaw-dench/workspace/skills/<name>/SKILL.md`（frontmatter 設 `always: true`）
2. 把**最關鍵的查詢指令**寫在 `IDENTITY.md` 的 contract section
3. `SKILL.md` 放補充資訊（表結構、範例 SQL、操作指南）
4. 加強制規則：「禁止編造資料」「DB 已預設連線」
5. **開新對話測試**（skill 只在新對話載入）
6. 小模型不穩定 → 切換更強模型（GPT-4.1-mini / Claude Sonnet）
