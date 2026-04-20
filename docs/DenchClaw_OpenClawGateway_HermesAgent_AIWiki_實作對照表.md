# DenchClaw OpenClaw Gateway + Hermes Agent 模式 + AI Wiki 實作對照表

> 更新日期：2026-04-18
> 目的：把目前 DenchClaw 的融合架構，對應到已經落地的檔案、能力與下一步缺口。

---

## 1. 一句話定位

目前 DenchClaw 的方向是：

- 用 `OpenClaw Gateway` 當底盤
- 用 `Hermes Agent` 的方式做 orchestration
- 用 `Karpathy AI Wiki` 的方式做知識層

這不是把三套系統硬疊在一起，而是把它們拆成不同層級：

- `Gateway`：入口與 runtime
- `Hermes-style`：工作流程與代理模式
- `AI Wiki`：知識編譯與沉澱

---

## 2. 架構對照表

| 層 | 設計角色 | 目前已落地內容 | 主要檔案 |
|----|----------|----------------|----------|
| Gateway Layer | 入口、session、模型調用、工具橋接 | chat route、web session metadata、debug routes | `apps/web/app/api/chat/route.ts` |
| Planner Layer | 問題分類、前置判斷 | `plannerPreflight` | `apps/web/lib/ycrm-context-builder.ts` |
| Context Engine Layer | 組合最小上下文包 | `plannerContextPack` | `apps/web/lib/ycrm-context-pack.ts` |
| Session Runtime Layer | 保存 planner 產物 | `plannerPreflight / plannerContextPack / plannerLearningDraft` 持久化 | `apps/web/app/api/web-sessions/shared.ts` |
| UI Visibility Layer | 顯示目前 routing 狀態 | sidebar badge、chat header、debug page | `apps/web/app/components/workspace/chat-sessions-sidebar.tsx` |
| Learning Loop Layer | 先產生 draft，不直接亂寫 | `plannerLearningDraft` | `apps/web/lib/ycrm-learning-draft.ts` |
| Safe Writeback Layer | 只寫回 wiki draft files | `write wiki draft files` | `apps/web/lib/ycrm-learning-writeback.ts` |
| Knowledge Layer | AI Wiki 基礎骨架 | `wiki / schema / ontology / source-of-truth / templates` | `wiki/`, `schema/` |
| Domain Skill Layer | Y-CRM domain rules | skill / references / scripts | `skills/ycrm/` |

---

## 3. OpenClaw Gateway 對應實作

### 目前扮演的角色

- chat 入口
- session runtime
- tool bridge
- 模型請求入口
- planner 產物持久化容器

### 目前對應檔案

- `apps/web/app/api/chat/route.ts`
- `apps/web/app/api/web-sessions/shared.ts`
- `apps/web/app/api/web-sessions/[id]/route.ts`

### 目前已做到

- chat 送出前會先跑 Y-CRM planner preflight
- session metadata 會保存 planner 相關產物
- debug route 與 UI 都可以直接讀回 session 上的 planner 狀態

### 尚未做到

- 真正的 multi-system planner
- model router
- local-vs-cloud inference routing

---

## 4. Hermes Agent 模式對應實作

### 4.1 Planner

Hermes 的 planner 思路，目前在 DenchClaw 對應到：

- `apps/web/lib/ycrm-context-builder.ts`

目前已做到：

- intent 分類
- Y-CRM 是否優先路由
- workspace 解析
- warning / blocker / handoff 判斷

### 4.2 Context Engine

Hermes 的 context engine 思路，目前在 DenchClaw 對應到：

- `apps/web/lib/ycrm-context-pack.ts`

目前已做到：

- `read_first`
- `wiki`
- `playbooks`
- `memory_keys`
- `live_query_steps`
- `execution_hints`

### 4.3 Memory

Hermes 的 memory 思路，目前在 DenchClaw 是先以兩種方式落地：

1. session metadata
2. learning draft 裡的 memory drafts

主要檔案：

- `apps/web/app/api/web-sessions/shared.ts`
- `apps/web/lib/ycrm-learning-draft.ts`

### 4.4 Learning Loop

Hermes 的 learning loop 思路，目前在 DenchClaw 對應到：

- `apps/web/lib/ycrm-learning-draft.ts`
- `apps/web/app/api/debug/ycrm-learning-draft/route.ts`
- `apps/web/app/api/debug/ycrm-learning-draft/writeback/route.ts`
- `apps/web/lib/ycrm-learning-writeback.ts`

目前已做到：

- 手動觸發 learning draft
- 同 session draft cache reuse
- `minimal_evidence` 模式
- 手動 writeback 到 wiki draft files

目前刻意還沒做：

- 自動全量學習
- 自動寫回正式知識頁
- 自動寫回 ERP / CRM / MES / WMS / EMS

### 4.5 Subagent Pattern

Hermes 的 subagent pattern 目前還沒有在 DenchClaw 內正式落地成 runtime feature。

目前狀態：

- 架構上已預留方向
- 實作上還沒展開

---

## 5. Karpathy AI Wiki 對應實作

### 5.1 raw / wiki / schema

AI Wiki 的三層設計，目前在 DenchClaw 已經開始建立骨架：

- `wiki/`
- `schema/`

主要內容：

- `schema/ontology.md`
- `schema/source-of-truth.md`
- `schema/integration-profiles/ycrm.md`
- `wiki/index.md`
- `wiki/log.md`
- Y-CRM templates

### 5.2 ontology / source-of-truth

目前已落地檔案：

- `schema/ontology.md`
- `schema/source-of-truth.md`

這是跨系統整合的必要基礎，目的是避免未來 ERP / MES / WMS / EMS 接進來後語意互撞。

### 5.3 ingest / query / lint

目前完成度：

- `query`：已部分落地，先以 Y-CRM builder / context pack / live query rules 呈現
- `ingest`：僅完成 draft 方向，尚未做正式 pipeline
- `lint`：尚未正式實作

---

## 6. Y-CRM 目前是第一個完整試點

目前真正走完整條線的是 `Y-CRM`：

1. skill
2. integration profile
3. wiki templates
4. planner preflight
5. context pack
6. session visibility
7. learning draft
8. wiki writeback

這代表 Y-CRM 現在已經不是單純 skill，而是：

> DenchClaw 新架構的第一個完整 domain pilot

---

## 7. 目前最重要的 guardrails

### Token guardrails

目前 learning loop 已經有這些省 token 規則：

- `single_session_single_draft`
- `manual_trigger_only`
- `planner_context_only`
- `minimal_evidence`

### Writeback guardrails

目前 writeback 只允許：

- 寫入 `wiki/...` draft files

目前刻意不允許：

- 自動覆蓋正式 wiki
- 自動修改 Y-CRM 資料
- 自動修改 ERP / MES / WMS / EMS

---

## 8. 下一步缺口

如果延續這條路，下一批最合理的缺口是：

1. `learning draft review workflow`
   - 讓 draft 不只存在 debug page，而有更清楚的 review 介面

2. `wiki draft promotion flow`
   - 將 draft 升格成正式 wiki 的人工核准流程

3. `multi-system ontology rollout`
   - 把 ERP / MES / WMS / EMS 接到同一套 ontology

4. `model router`
   - 為未來本地模型與雲端 fallback 做準備

---

## 9. 一句話總結

> 目前 DenchClaw 的實作方向，確實就是：  
> `OpenClaw Gateway` 當底盤，`Hermes Agent` 當工作方式，`AI Wiki` 當知識層，然後先從 `Y-CRM` 做出第一條完整閉環。
