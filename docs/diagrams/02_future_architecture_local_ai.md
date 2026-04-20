# DenchClaw 未來架構（Future Architecture with Local AI）

> 產生日期：2026-04-17
> 狀態：規劃版
> 目標：企業內部 AI 產品 — 本地模型主力 + 多系統融合

---

## 總覽架構圖

```mermaid
graph TB
    %% ===== Layer 1: Experience Layer =====
    subgraph L1["Layer 1 · Experience Layer（使用者互動層）"]
        Browser["🌐 瀏覽器"]
        WebUI["DenchClaw Web UI<br/>Next.js · React<br/>Port 3100"]
        Chat["Chat Panel<br/>AI 對話"]
        Workspace["Workspace<br/>資料表 · 編輯器"]
        Dashboard["Dashboard<br/>跨系統報表"]
        EntityCard["Entity Card<br/>客戶 · 訂單 · 工單 · 庫存"]
        Timeline["Timeline<br/>跨系統事件流"]
        RiskPanel["寫入風險面板<br/>L0-L4 確認機制"]
    end

    Browser --> WebUI
    WebUI --> Chat
    WebUI --> Workspace
    WebUI --> Dashboard
    WebUI --> EntityCard
    WebUI --> Timeline
    WebUI --> RiskPanel

    %% ===== Layer 2: Agent Runtime Layer =====
    subgraph L2["Layer 2 · Agent Runtime Layer（Hermes Agent 模式）"]
        Gateway["OpenClaw Gateway<br/>Port 19001"]
        Planner["Planner / Orchestrator<br/>跨系統任務編排"]
        Subagents["Subagents<br/>平行子代理"]
        Cron["Cron<br/>每日營運摘要 · 異常監測"]
        Session["Session Memory"]
        Tools["工具層"]
        ToolExec["exec"]
        ToolRead["read"]
        ToolWeb["web"]
    end

    Chat --> Gateway
    Gateway --> Planner
    Planner --> Subagents
    Gateway --> Cron
    Gateway --> Session
    Gateway --> Tools
    Tools --> ToolExec
    Tools --> ToolRead
    Tools --> ToolWeb

    %% ===== Model Router Layer (NEW) =====
    subgraph ModelRouter["Model Router Layer（智慧模型路由 🆕）"]
        Router["Model Router<br/>依任務複雜度自動選擇"]

        subgraph LocalSmall["🖥️ 本地小模型"]
            Qwen["Qwen 3.5<br/>快速分類 · 路由<br/>意圖辨識 · query rewrite<br/>metadata 抽取"]
        end

        subgraph LocalMain["🖥️ 本地主模型"]
            Gemma["Gemma 4 E26B<br/>via Ollama<br/>跨系統分析 · SOP 推導<br/>根因分析 · 內部報告"]
            TurboQuant["Google turboQuant<br/>量化優化<br/>降低推理資源消耗"]
            KVCache["KV Cache Reuse<br/>上下文成本優化<br/>固定模板 · wiki 頁 · 系統上下文"]
        end

        subgraph CloudModel["☁️ 雲端模型（僅複雜任務）"]
            CloudLLM["GPT-4.1 / Claude / etc.<br/>複雜推理 · 高價值報告<br/>策略分析（最少量使用）"]
        end

        MacMini["Mac mini M4<br/>本地推理主機<br/>常駐 agent · 排程任務<br/>wiki 維護"]
    end

    Gateway --> Router
    Router -->|"簡單：分類/路由/摘要"| Qwen
    Router -->|"中等：分析/報告/SOP"| Gemma
    Router -->|"複雜：策略/高價值"| CloudLLM
    TurboQuant --> Gemma
    KVCache --> Gemma
    MacMini --> Qwen
    MacMini --> Gemma

    %% ===== Layer 3: Enhanced Context Engine =====
    subgraph L3["Layer 3 · Enhanced Context Engine（增強上下文引擎 🆕）"]
        ContextEngine["Multi-System Context Engine<br/>跨系統意圖辨識<br/>優先級路由"]
        Classifier["Intent / Domain Classifier<br/>CRM? ERP? MES? WMS?"]
        ContextBuilder["Context Builder<br/>動態選材 · 精準組裝"]
        ContextPack["Context Pack<br/>結構化 prompt 區塊"]
        Memory["Memory Layer<br/>使用者偏好 · 對話摘要<br/>慣用術語 · 常追蹤對象"]
    end

    Gateway --> ContextEngine
    ContextEngine --> Classifier
    Classifier --> ContextBuilder
    ContextBuilder --> ContextPack
    ContextEngine --> Memory
    ContextPack --> Gateway

    %% ===== Skill System =====
    subgraph Skills["Domain Skills（領域技能）"]
        Identity["IDENTITY.md<br/>系統契約"]
        YCRM_Skill["ycrm<br/>客戶 · 商機 · LINE"]
        ERP_Skill["erp 🆕<br/>訂單 · 採購 · 庫存 · 財務"]
        MES_Skill["mes 🆕<br/>工單 · 製程 · 設備 · 良率"]
        WMS_Skill["wms 🆕<br/>庫位 · 批號 · 揀貨 · 波次"]
        EMS_Skill["ems 🆕<br/>能源 · 設備 · 環境監控"]
        CRM_Skill["crm<br/>通用 CRM 操作"]
    end

    Gateway --> Identity
    ContextBuilder --> YCRM_Skill
    ContextBuilder --> ERP_Skill
    ContextBuilder --> MES_Skill
    ContextBuilder --> WMS_Skill
    ContextBuilder --> EMS_Skill

    %% ===== Layer 4: Mature Knowledge Layer =====
    subgraph L4["Layer 4 · Canonical Knowledge Layer（成熟知識層 🆕）"]
        subgraph WikiMature["AI Wiki（成熟版）"]
            WikiIngest["Ingest<br/>讀取來源 → 產生摘要<br/>更新 index → 寫入 log"]
            WikiQuery["Query<br/>先查 wiki → 必要才查原始系統<br/>新分析寫回 wiki"]
            WikiLint["Lint<br/>找矛盾 · 找過期 · 找孤兒頁<br/>找重複概念 · 檢查標記"]
        end

        Ontology["Canonical Ontology<br/>16+ 跨系統企業物件<br/>Customer · SalesOrder<br/>WorkOrder · InventoryLot · ..."]
        SOT["Source of Truth Rules<br/>客戶→CRM · 訂單→ERP<br/>工單→MES · 庫位→WMS"]
        Playbooks["Playbooks / SOPs<br/>追交期延誤 · 查庫存差異<br/>查缺料原因 · 客訴追溯"]

        subgraph ThreeTier["三層知識結構"]
            Raw["raw/<br/>原始來源（不可修改）"]
            Wiki["wiki/<br/>AI 維護的知識頁"]
            Schema["schema/<br/>規範 AI 行為"]
        end
    end

    ContextBuilder --> WikiQuery
    WikiIngest --> Wiki
    WikiLint --> Wiki
    Raw --> WikiIngest

    %% ===== Layer 5: Unified Adapter Layer =====
    subgraph L5["Layer 5 · Unified Adapter Layer（統一接入層 🆕）"]
        AdapterInterface["SystemAdapter Interface<br/>discoverSchema() · searchEntities()<br/>query() · executeAction()<br/>explainConflict()"]

        YCRM_Adapter["Y-CRM Adapter<br/>DuckDB + REST + GraphQL"]
        ERP_Adapter["ERP Adapter 🆕<br/>postgres_scanner"]
        MES_Adapter["MES Adapter 🆕<br/>postgres_scanner"]
        WMS_Adapter["WMS Adapter 🆕<br/>postgres_scanner"]
        EMS_Adapter["EMS Adapter 🆕<br/>TBD"]

        subgraph WriteRisk["寫入風險分級 🆕"]
            L0["L0 純讀取<br/>直接允許"]
            L1_Risk["L1 低風險<br/>可預設允許"]
            L2_Risk["L2 一般業務<br/>顯示確認"]
            L3_Risk["L3 高風險營運<br/>人工確認 + audit"]
            L4_Risk["L4 關鍵寫入<br/>禁止或雙重授權"]
        end
    end

    ToolExec --> YCRM_Adapter
    ToolExec --> ERP_Adapter
    ToolExec --> MES_Adapter
    ToolExec --> WMS_Adapter
    ToolExec --> EMS_Adapter
    YCRM_Adapter --> AdapterInterface
    ERP_Adapter --> AdapterInterface
    MES_Adapter --> AdapterInterface
    WMS_Adapter --> AdapterInterface
    RiskPanel --> WriteRisk

    %% ===== Layer 6: Multi-System of Record =====
    subgraph L6["Layer 6 · Systems of Record（多系統真實資料層）"]
        YCRM_DB[("Y-CRM<br/>PostgreSQL<br/>:5432<br/>客戶 · 商機 · LINE")]
        ERP_DB[("ERP<br/>PostgreSQL/MySQL<br/>:5433<br/>訂單 · 採購 · 財務")]
        MES_DB[("MES<br/>PostgreSQL<br/>:5434<br/>工單 · 製程 · 設備")]
        WMS_DB[("WMS<br/>PostgreSQL<br/>:5435<br/>庫位 · 批號 · 揀貨")]
        EMS_DB[("EMS<br/>TBD<br/>能源 · 環境")]
    end

    YCRM_Adapter -->|"READ_ONLY"| YCRM_DB
    ERP_Adapter -->|"READ_ONLY"| ERP_DB
    MES_Adapter -->|"READ_ONLY"| MES_DB
    WMS_Adapter -->|"READ_ONLY"| WMS_DB
    EMS_Adapter --> EMS_DB

    %% ===== Mature Learning Loop =====
    subgraph LLoop["Learning Loop（成熟版 🆕）"]
        MemoryLearn["Memory Learning<br/>偏好 · 別名 · 慣用流程"]
        WikiLearn["Wiki Learning<br/>客戶摘要 · 異常分析<br/>月度洞察"]
        SkillLearn["Skill Learning<br/>新欄位對照 · SQL pattern<br/>錯誤處理"]
        PlaybookLearn["Playbook Learning<br/>跨系統 SOP 固化"]
        Governance["Governance<br/>auto-draft → human approve<br/>→ write back"]
    end

    Gateway -->|"高價值輸出"| Governance
    Governance --> MemoryLearn
    Governance --> WikiLearn
    Governance --> SkillLearn
    Governance --> PlaybookLearn
    MemoryLearn --> Memory
    WikiLearn --> Wiki
    SkillLearn --> YCRM_Skill
    PlaybookLearn --> Playbooks

    %% ===== Styling =====
    classDef layer1 fill:#dbeafe,stroke:#3b82f6,stroke-width:2px
    classDef layer2 fill:#fef3c7,stroke:#f59e0b,stroke-width:2px
    classDef layer3 fill:#d1fae5,stroke:#10b981,stroke-width:2px
    classDef layer4 fill:#ede9fe,stroke:#8b5cf6,stroke-width:2px
    classDef layer5 fill:#fce7f3,stroke:#ec4899,stroke-width:2px
    classDef layer6 fill:#f3f4f6,stroke:#6b7280,stroke-width:2px
    classDef newFeature fill:#fef9c3,stroke:#eab308,stroke-width:3px
    classDef local fill:#dcfce7,stroke:#16a34a,stroke-width:3px
    classDef cloud fill:#fff7ed,stroke:#f97316,stroke-width:2px

    class Browser,WebUI,Chat,Workspace,Dashboard,EntityCard,Timeline,RiskPanel layer1
    class Gateway,Planner,Subagents,Cron,Session,Tools,ToolExec,ToolRead,ToolWeb layer2
    class ContextEngine,Classifier,ContextBuilder,ContextPack,Memory layer3
    class WikiIngest,WikiQuery,WikiLint,Ontology,SOT,Playbooks,Raw,Wiki,Schema layer4
    class AdapterInterface,YCRM_Adapter,ERP_Adapter,MES_Adapter,WMS_Adapter,EMS_Adapter layer5
    class YCRM_DB,ERP_DB,MES_DB,WMS_DB,EMS_DB layer6
    class Router,Qwen,Gemma,TurboQuant,KVCache,MacMini local
    class CloudLLM cloud
```

---

## 模型路由決策流程

```mermaid
flowchart TD
    Task["使用者任務"] --> Classify["Qwen 3.5<br/>意圖分類"]

    Classify -->|"簡單任務"| Simple["本地小模型 Qwen 3.5"]
    Classify -->|"中等任務"| Medium["本地主模型 Gemma 4 E26B"]
    Classify -->|"複雜任務"| Complex["雲端模型 GPT-4.1 / Claude"]

    subgraph SimpleTask["簡單任務"]
        S1["意圖辨識"]
        S2["query rewrite"]
        S3["metadata 抽取"]
        S4["wiki ingest 初稿"]
        S5["分類與路由"]
    end

    subgraph MediumTask["中等任務"]
        M1["跨系統查詢整理"]
        M2["SOP 推導"]
        M3["根因分析"]
        M4["內部報告生成"]
        M5["固定格式報表"]
    end

    subgraph ComplexTask["複雜任務（最少量使用）"]
        C1["長鏈條策略分析"]
        C2["高價值決策輔助"]
        C3["跨系統綜合報告"]
    end

    Simple --> SimpleTask
    Medium --> MediumTask
    Complex --> ComplexTask

    subgraph Optimization["本地推理優化"]
        TQ["turboQuant<br/>量化壓縮 → M4 可跑"]
        KV["KV Cache Reuse<br/>固定上下文不重算"]
        HW["Mac mini M4<br/>常駐推理主機"]
    end

    Medium --> Optimization

    style Simple fill:#dcfce7,stroke:#16a34a
    style Medium fill:#dcfce7,stroke:#16a34a
    style Complex fill:#fff7ed,stroke:#f97316
    style Optimization fill:#f0fdf4,stroke:#22c55e,stroke-width:2px
```

---

## 跨系統工作流範例：訂單延誤分析

```mermaid
sequenceDiagram
    actor User as 使用者
    participant DC as DenchClaw
    participant Router as Model Router
    participant Qwen as Qwen 3.5
    participant Gemma as Gemma 4 E26B
    participant CRM as Y-CRM
    participant ERP as ERP
    participant MES as MES
    participant WMS as WMS
    participant Wiki as AI Wiki
    participant Learn as Learning Loop

    User->>DC: 這張單為什麼還沒交？

    DC->>Router: 路由決策
    Router->>Qwen: 快速分類
    Qwen-->>Router: 領域：ERP+MES+WMS<br/>複雜度：中等

    Router->>Gemma: 啟動跨系統分析

    par 平行查詢
        Gemma->>Wiki: 查已有摘要 / 歷史分析
        Gemma->>CRM: 查客戶與商機背景
        Gemma->>ERP: 查訂單 · 承諾交期 · 缺料
        Gemma->>MES: 查工單進度 · 卡站 · 報工
        Gemma->>WMS: 查庫存分配 · 出貨狀態
    end

    Wiki-->>Gemma: 歷史紀錄
    CRM-->>Gemma: 客戶脈絡
    ERP-->>Gemma: 訂單狀態
    MES-->>Gemma: 生產進度
    WMS-->>Gemma: 庫存分配

    Gemma->>Gemma: 綜合判斷根因
    Gemma-->>DC: 延誤原因 · 影響 · 建議

    DC-->>User: 展示分析結果

    DC->>Learn: 高價值輸出
    Learn->>Wiki: auto-draft 延誤分析頁
    Learn->>Learn: human approve
    Learn->>Wiki: write back（沉澱）
```

---

## 演進階段

```mermaid
gantt
    title DenchClaw 演進路線圖
    dateFormat YYYY-MM

    section Stage 0：架構打底
    Ontology + Source of Truth           :done, s0a, 2026-04, 2026-04
    Wiki 骨架 + Y-CRM 對齊               :done, s0b, 2026-04, 2026-04
    Context Engine v1（Y-CRM）            :done, s0c, 2026-04, 2026-04

    section Stage 1：雲端主模型 + 架構完成
    ERP Skill + Adapter                  :active, s1a, 2026-05, 2026-06
    MES Skill + Adapter                  :s1b, 2026-06, 2026-07
    WMS Skill + Adapter                  :s1c, 2026-07, 2026-08
    Multi-system Context Router          :s1d, 2026-06, 2026-08
    Learning Loop v1                     :s1e, 2026-07, 2026-08

    section Stage 2：混合模型模式
    Qwen 3.5 小模型接入                    :s2a, 2026-08, 2026-09
    Gemma 4 E26B 本地主模型                :s2b, 2026-09, 2026-10
    turboQuant 量化優化                    :s2c, 2026-09, 2026-10
    KV Cache 上下文優化                    :s2d, 2026-10, 2026-11
    Model Router 自動路由                  :s2e, 2026-10, 2026-11

    section Stage 3：本地模型成為主力
    雲端任務降至 <20%                      :s3a, 2026-11, 2026-12
    Playbook 自動化                       :s3b, 2026-11, 2026-12
    Wiki Lint 定期健檢                     :s3c, 2026-12, 2027-01

    section Stage 4：企業內部 AI 產品
    多部門介面 + 權限                      :s4a, 2027-01, 2027-03
    EMS 接入                              :s4b, 2027-02, 2027-03
    完整 Audit Trail                      :s4c, 2027-02, 2027-03
```

---

## 現在 vs 未來 對照表

| 面向 | 目前架構 | 未來架構 |
|------|----------|----------|
| **AI 模型** | ☁️ OpenAI GPT-4.1-mini（主要）<br/>🖥️ Ollama gemma4:e2b（備援） | 🖥️ Qwen 3.5（路由/分類）<br/>🖥️ Gemma 4 E26B（主力）<br/>☁️ 雲端模型（僅複雜任務） |
| **模型路由** | 手動切換 | 自動路由（依複雜度） |
| **推理優化** | 無 | turboQuant + KV Cache Reuse |
| **推理主機** | 開發機 | Mac mini M4（常駐） |
| **外部系統** | Y-CRM（唯一） | Y-CRM + ERP + MES + WMS + EMS |
| **Adapter** | 直接 DuckDB 查詢 | 統一 SystemAdapter 介面 |
| **知識層** | Wiki 骨架（初版） | 成熟 AI Wiki（ingest/query/lint） |
| **Ontology** | 初版（Y-CRM 為主） | 16+ 跨系統企業物件 |
| **Context Engine** | Y-CRM 單系統路由 | 多系統優先級路由 |
| **寫入控制** | 無分級 | L0-L4 風險分級 |
| **Learning Loop** | 概念階段 | auto-draft → approve → write back |
| **Playbooks** | 無 | 跨系統 SOP 自動固化 |
| **資料隱私** | 敏感資料過雲端 | 本地推理，資料不出內網 |
| **成本** | 按 API 用量計費 | 高頻任務本地化，成本可控 |
| **使用者** | 工程師 / 管理者 | 業務 · 內勤 · 採購 · 生管 · 倉管 |
