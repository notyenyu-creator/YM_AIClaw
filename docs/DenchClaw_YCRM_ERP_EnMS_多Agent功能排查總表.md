# DenchClaw × Y-CRM × ERP × EnMS 多 Agent 功能排查總表

更新日期：2026-06-02

## 1. 核心結論

DenchClaw 現在不是只有單一聊天介面，而是三條 domain integration 都可掛在同一套 AI runtime contract 上：

1. `OpenClaw Gateway`
2. `Hermes-style planner / context pack`
3. `Session metadata persistence`
4. `Auto learning trigger`
5. `AI Wiki draft -> review -> promotion`

目前 `Y-CRM`、`ERP`、`EnMS` 都已對齊這個 contract。差異主要在各自的 source-of-truth、skill 規則與 domain-specific join / guardrail。

## 2. 多 Agent 角色

### PM Agent

- 定義問題、系統範圍、source-of-truth 與 acceptance criteria
- 檔案：`skills/pm-agent/SKILL.md`

### RD Agent

- 驗證 planner / context / learning / review / wiki promotion 是否真正落地
- 檔案：`skills/rd-agent/SKILL.md`

### QA Agent

- 驗證 routing、review、audit trail、guardrail 是否穩定
- 檔案：`skills/qa-agent/SKILL.md`

### TPM Agent

- 管理依賴、階段、風險與對外可講邊界
- 檔案：`skills/tpm-agent/SKILL.md`

## 3. 架構一致性矩陣

| 架構層 | Y-CRM | ERP | EnMS |
|---|---|---|---|
| Skill | `skills/ycrm/SKILL.md` | `skills/erp/SKILL.md` | `skills/enms/SKILL.md` |
| Integration Profile | 既有 CRM / workspace contract | `schema/integration-profiles/erp.md` | `schema/integration-profiles/enms.md` |
| Planner Preflight | `ycrm-context-builder.ts` | `erp-context-builder.ts` | `enms-context-builder.ts` |
| Context Pack | `ycrm-context-pack.ts` | `erp-context-pack.ts` | `enms-context-pack.ts` |
| Chat Route Persistence | `plannerPreflight / plannerContextPack` | `erpPlannerPreflight / erpPlannerContextPack` | `enmsPlannerPreflight / enmsPlannerContextPack` |
| Learning Draft | `ycrm-learning-draft.ts` | `erp-learning-draft.ts` | `enms-learning-draft.ts` |
| Auto Learning Trigger | `ycrm-learning-auto-trigger.ts` | `erp-learning-auto-trigger.ts` | `enms-learning-auto-trigger.ts` |
| Writeback | `ycrm-learning-writeback.ts` | `erp-learning-writeback.ts` | `enms-learning-writeback.ts` |
| Promotion / Resolve | `ycrm-learning-promotion.ts` | `erp-learning-promotion.ts` | `enms-learning-promotion.ts` |
| Review UI | `/review/ycrm` | `/review/erp` | `/review/enms` |
| Debug Route | `/api/debug/ycrm-learning-draft` | `/api/debug/erp-learning-draft` | `/api/debug/enms-learning-draft` |
| Wiki Templates | customer / opportunity / line follow-up | order / inventory / work order / procurement | demand / site energy / anomaly / load shedding |
| Tests | planner / review / auto trigger | planner / review / auto trigger | planner / review / auto trigger |

## 4. Source-of-Truth 邊界

### Y-CRM

- 商務脈絡、客戶、聯絡人、商機、LINE 互動
- 適合回答：客戶背景、業務跟進、互動摘要、商機健康度

### ERP

- 訂單、出貨、庫存、採購、工單、財務單據
- 適合回答：履約進度、缺料風險、庫存快照、採購狀態

### EnMS

- 設備量測、需量、功因、告警、場域 benchmark、raw trace
- 適合回答：能耗異常、超約風險、節能機會、場域比較

## 5. 功能排查重點

### PM 視角

- 問題是否先路由到正確 source-of-truth
- 是否有清楚的 business output
- 是否定義跨系統 handoff

### RD 視角

- 是否有對應 planner / context pack / session persistence
- 是否有 learning draft / review / wiki promotion
- 是否有 domain-specific guardrail

### QA 視角

- 是否有測試保護路由與 learning flow
- promotion conflict 是否可追溯
- review 是否保留 reviewer / reason / note

### TPM 視角

- 是否可對外 demo
- 哪些是 phase-1，哪些可講成已完成
- 是否有明確 rollout 風險

## 6. 建議對外說法

DenchClaw 不是把三個系統硬塞進同一個 prompt，而是把 `Y-CRM`、`ERP`、`EnMS` 都接成同一套可驗證的 AI runtime contract：先做 domain routing，再做 context pack，再把結果進入 session persistence、learning draft、人工 review 與 AI Wiki promotion。這代表技術能力不只是在做聊天，而是在做可治理、可審核、可擴充的 enterprise agent architecture。
