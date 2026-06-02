# DenchClaw AI 技術架構整理（投資人版）

更新日期：2026-06-02

> 本文件依目前 repo 內的 AI 實作整理而成。對外若以 `DenchClaw` 為 AI 品牌，可將其理解為 Y-CRM 內的 AI Agent / AI Chat / MCP / Tooling 能力層。

## 一句話版本

DenchClaw 不是單一聊天機器人，而是一個「可控、可擴充、可接 CRM 真實資料與工作流」的 Agentic AI 平台，核心能力包含多模型路由、權限化工具呼叫、結構化資料操作、檔案分析、外部 MCP 連接，以及工作流自動執行。

## 1. 技術定位

DenchClaw 的設計重點不是做通用問答，而是讓 AI 能在企業 CRM 場景中安全地完成實際工作，例如：

- 查詢 CRM 資料
- 建立 / 更新客戶、聯絡人、商機等記錄
- 分析使用者上傳的 CSV / Excel / 文件
- 在工作流中執行 AI 任務
- 透過 MCP 對外提供標準化 AI 工具介面

這代表 DenchClaw 的核心價值不只是「生成答案」，而是「把 AI 變成可執行企業流程的工作代理」。

## 2. 架構總覽

```text
Frontend AI Chat / Admin Settings
    ->
NestJS AI Streaming API
    ->
Model Router / Agent Orchestrator
    ->
Tool Registry + Permission Layer
    ->
CRM Data / Workflow / Email / HTTP / Code Interpreter / MCP
    ->
PostgreSQL / Redis / File Storage / External Model Providers
```

更細一點可拆成六層：

### A. 使用者互動層

- 前端提供 AI Chat、AI Agent 設定、MCP 設定頁面
- 支援串流回應、檔案上傳、對話執行狀態、Code Execution 結果展示

對應路徑：

- `packages/twenty-front/src/modules/ai/`
- `packages/twenty-front/src/pages/settings/ai/`

### B. AI API / 串流層

- 後端用 NestJS 提供 `agent-chat/stream`
- 回應採 streaming UI message
- 對話內容、token 使用量、thread 狀態都會持久化

對應路徑：

- `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/controllers/agent-chat.controller.ts`
- `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/services/agent-chat-streaming.service.ts`
- `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/services/agent-chat.service.ts`

### C. 模型路由與 Agent 編排層

- 支援 OpenAI、Anthropic、xAI、Groq、OpenAI-compatible provider
- Workspace 可設定 `smart model` 與 `router model`
- Router 會根據訊息內容判斷應由哪個 agent 處理
- Agent 之間可做 handoff，形成多代理協作

對應路徑：

- `packages/twenty-server/src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service.ts`
- `packages/twenty-server/src/engine/metadata-modules/ai-router/ai-router.service.ts`
- `packages/twenty-server/src/engine/workspace-manager/workspace-sync-metadata/standard-agents/`

### D. Tool / Skill 執行層

- 不是把所有工具一次塞給模型，而是分成 catalog、learn、execute 三段
- AI 可先看工具目錄，再按需學習 schema，最後執行工具
- 這種做法可降低 prompt 體積，也更容易控管工具權限
- 支援 Skill 機制，將常見能力封裝成可載入的能力包

對應路徑：

- `packages/twenty-server/src/engine/core-modules/tool-provider/services/tool-registry.service.ts`
- `packages/twenty-server/src/engine/core-modules/tool-provider/tools/get-tool-catalog.tool.ts`
- `packages/twenty-server/src/engine/core-modules/tool-provider/tools/learn-tools.tool.ts`
- `packages/twenty-server/src/engine/core-modules/tool-provider/tools/execute-tool.tool.ts`

### E. 企業資料與業務動作層

- CRM 查詢 / 建立 / 更新 / 刪除工具是從 metadata 動態生成
- 代表 AI 能自動適配標準物件與自訂物件，不必為每個物件手寫工具
- 另有 Email、HTTP、Help Center Search、Code Interpreter 等 action tools
- AI 也能嵌入 workflow action 中，被當成流程節點執行

對應路徑：

- `packages/twenty-server/src/engine/core-modules/tool-provider/providers/database-tool.provider.ts`
- `packages/twenty-server/src/engine/core-modules/tool-provider/providers/action-tool.provider.ts`
- `packages/twenty-server/src/modules/workflow/workflow-executor/workflow-actions/ai-agent/`

### F. 基礎資料與外部整合層

- 主資料儲存在 PostgreSQL
- Redis 用於快取、對話摘要、效能優化
- 檔案走 file storage
- 外部模型供應商透過 AI SDK 統一接入
- MCP Server 讓外部 AI client 可直接安全操作 workspace 資料

對應路徑：

- `packages/twenty-server/src/engine/api/mcp/services/mcp-protocol.service.ts`
- `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/utils/trim-conversation-history.util.ts`
- `packages/twenty-server/src/engine/core-modules/code-interpreter/`

## 3. 核心技術亮點

### 1. Metadata-driven AI

這是 DenchClaw 很關鍵的差異化能力。

AI 不是只會操作固定表格，而是會根據 workspace 的 object metadata / field metadata，動態生成對應工具與輸入 schema。也就是說，當 CRM 新增自訂物件或欄位時，AI 能跟著理解並操作，不需要整套重寫。

這讓 DenchClaw 更像「可延展的 AI 操作層」，而不是一次性 demo。

### 2. Multi-model, model-router architecture

平台不是綁死單一模型，而是採模型註冊表設計：

- 快模型可做 routing / 輕量任務
- 強模型可做複雜推理與多步驟工具執行
- Workspace 可以按成本與品質需求切換

這讓成本、速度、品質三者可以持續優化，而不是被單一供應商綁住。

### 3. Agentic tool execution with permission boundary

DenchClaw 的 AI 能真正動作，但不是無限制地動作。

- 工具是依 workspace / role / user context 動態生成
- 查詢與寫入能力取決於權限
- MCP 也沿用相同權限邊界
- `code_interpreter` 被刻意排除在 MCP 外，避免遞迴執行風險

這讓 AI automation 比單純聊天更有價值，同時比「直接給模型全部後端權限」更安全。

### 4. Built-in code interpreter

平台內建 Python code execution，能做：

- CSV / Excel 分析
- 圖表生成
- 文件處理
- 批次資料轉換

目前設計支援兩種 driver：

- `LocalDriver`：開發用途，速度快，但程式碼註解已明示不安全
- `E2BDriver`：沙箱執行，較適合正式環境

這代表 DenchClaw 已具備從「查資料」進一步走到「做分析、產出附件、回傳結果」的能力。

### 5. MCP-first external connectivity

系統可直接輸出 MCP server 設定，讓 Claude Desktop、Cursor、Windsurf 等外部 AI client 接上 workspace。

這很重要，因為它把 DenchClaw 從產品內功能，往「AI 基礎設施 / AI middleware」方向延伸。

### 6. Cost and performance optimization

目前實作不是單純把所有歷史訊息都丟給 LLM，而是已經做了幾層優化：

- Rolling Window：只送新訊息
- Rolling Summary：舊對話摘要化
- Redis Cache：降低重複摘要成本
- Query Limit：限制 AI 一次撈取過多資料
- Billing usage tracking：可追蹤 token / credit 使用量

這些設計直接影響商業化的毛利結構與穩定性。

## 4. 目前架構的真實狀態

這段建議對投資人可以講得誠實一點：

- 現階段主軸是「tool-based operational AI」，不是 embedding-first RAG
- 對 CRM 結構化資料來說，直接走權限化工具查詢通常比向量檢索更準
- 長對話記憶目前主要依賴 rolling summary，尚未看到正式導入向量記憶庫
- Code interpreter 的正式環境應以 sandbox driver 為主，不建議用 local execution 模式

換句話說，DenchClaw 目前比較像「能做事的企業 AI Agent」，而不是「文件型知識庫聊天機器人」。

## 5. 商業角度可怎麼講

你可以把 DenchClaw 定位成三件事的組合：

1. `AI Copilot`
讓使用者直接用自然語言查 CRM、更新資料、做分析。

2. `AI Operations Layer`
把 AI 接到真實的 CRM 工具、權限、工作流、Email、檔案與外部系統。

3. `AI Infrastructure for Business Apps`
透過 MCP、metadata-driven schema、multi-agent routing，把這套能力從單一功能做成可擴充平台。

## 6. 給投資人的 GitHub 導讀

如果你要附 GitHub 連結，建議請對方先看這幾個位置：

- `packages/twenty-front/src/modules/ai/`
  AI Chat 前端、串流訊息渲染、檔案上傳、Code Execution UI

- `packages/twenty-server/src/engine/metadata-modules/ai/ai-chat/`
  AI Chat 核心後端、system prompt、conversation trimming、thread persistence

- `packages/twenty-server/src/engine/metadata-modules/ai-router/`
  模型路由與 agent dispatch

- `packages/twenty-server/src/engine/core-modules/tool-provider/`
  Tool catalog、schema hydration、tool execution、permissionized tool layer

- `packages/twenty-server/src/engine/core-modules/code-interpreter/`
  Python execution、sandbox driver、輸入輸出檔案處理

- `packages/twenty-server/src/engine/api/mcp/`
  對外 MCP server 能力

- `packages/twenty-server/src/modules/workflow/workflow-executor/workflow-actions/ai-agent/`
  AI 作為 workflow node 的執行方式

## 7. 30 秒簡報口語版

DenchClaw 的 AI 架構不是只有聊天，而是把大模型接到 CRM 真實資料、權限系統、工具層與自動化流程。它支援多模型切換、agent routing、動態工具生成、檔案分析、MCP 對外整合，代表這套 AI 不只是回答問題，而是可以在企業場景中實際完成查詢、分析、更新與流程執行。從技術上看，它已經具備平台化雛形，而不是單點功能。

## 8. 建議你對外附上的一句備註

如果你要把 GitHub 一起給對方，建議附這句：

> Repo 內可直接看到 DenchClaw 的 AI 實作主體，包含模型路由、工具層、MCP、Code Interpreter、Workflow AI integration 與前後端串流架構；這不是單一 prompt-based chatbot，而是可操作業務資料的 agentic AI stack。
