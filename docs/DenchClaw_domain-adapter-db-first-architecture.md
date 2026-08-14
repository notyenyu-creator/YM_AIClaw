# DenchClaw Domain Adapter + DB-First Execution Pipeline

## Purpose
This document formalizes the current DenchClaw runtime into a shared architecture language without changing existing runtime behavior.

It is intended to:

- preserve the current investor-facing architecture narrative,
- define a reusable core that can support EnMS, ERP, Y-CRM, and future systems,
- separate model choice from system execution policy,
- clarify which parts are already implemented versus which parts are still roadmap items.

This document does **not** introduce a breaking architecture rewrite.
It captures the current runtime as a common contract so future changes can be made incrementally.

## Core Thesis
The long-term core should not be:

- a specific LLM,
- a single prompt,
- or a single hardcoded question list.

The core should be:

1. a **Domain Adapter** layer,
2. a **DB-first / source-of-truth execution pipeline**,
3. an **answer / chart evidence contract**,
4. and a **reviewable learning/writeback loop**.

## Shared Execution Pipeline
The shared execution pipeline already exists in partial form.

Target shared phases:

1. `domain_route`
2. `planner_preflight`
3. `context_pack`
4. `bootstrap_snapshot`
5. `verified_execution_or_model_guided_query`
6. `answer_and_chart_render`
7. `review_and_learning_writeback`

## Current Implementation Mapping

### Shared orchestration entry
- Chat route:
  - `apps/web/app/api/chat/route.ts`

### Domain-specific planner / pack / bootstrap
- EnMS:
  - `apps/web/lib/enms-context-builder.ts`
  - `apps/web/lib/enms-context-pack.ts`
  - `apps/web/lib/domain-bootstrap.ts`
- ERP:
  - `apps/web/lib/erp-context-builder.ts`
  - `apps/web/lib/erp-context-pack.ts`
  - `apps/web/lib/domain-bootstrap.ts`
- Y-CRM:
  - `apps/web/lib/ycrm-context-builder.ts`
  - `apps/web/lib/ycrm-context-pack.ts`
  - `apps/web/lib/domain-bootstrap.ts`

### Verified / deterministic execution
- EnMS:
  - Verified direct query:
    - `apps/web/lib/enms-verified-direct-query.ts`
  - Deterministic direct answer:
    - `apps/web/lib/enms-direct-answer.ts`
- ERP:
  - No dedicated verified direct-query layer yet
- Y-CRM:
  - No dedicated verified direct-query layer yet

### Learning / review / writeback
- EnMS:
  - `apps/web/lib/enms-learning-draft.ts`
  - `apps/web/lib/enms-learning-auto-trigger.ts`
  - `apps/web/lib/enms-learning-promotion.ts`
  - `apps/web/lib/enms-learning-writeback.ts`
- ERP:
  - `apps/web/lib/erp-learning-draft.ts`
  - `apps/web/lib/erp-learning-auto-trigger.ts`
  - `apps/web/lib/erp-learning-promotion.ts`
  - `apps/web/lib/erp-learning-writeback.ts`
- Y-CRM:
  - `apps/web/lib/ycrm-learning-draft.ts`
  - `apps/web/lib/ycrm-learning-auto-trigger.ts`
  - `apps/web/lib/ycrm-learning-promotion.ts`
  - `apps/web/lib/ycrm-learning-writeback.ts`

### Report / chart contract
- `apps/web/lib/report-blocks.ts`
- chart/report UI components under `apps/web/app/components/charts/`

## What Is Already Core-Like Today

### 1. Domain routing
The chat route already decides whether a request should flow through EnMS, ERP, or Y-CRM specific logic.

### 2. Domain context packs
Each system already has its own:

- read-first references,
- wiki/playbook context,
- execution hints,
- chart guardrails,
- memory keys,
- live query steps.

This is already close to a real adapter interface.

### 3. Bootstrap snapshot grounding
`domain-bootstrap.ts` already creates structured runtime grounding:

- facts
- joins
- cautions
- gaps
- stillAvailable

This is more than prompt text. It is a domain grounding layer.

### 4. DB-first verified answering for part of EnMS
EnMS already proves the pattern:

- selected questions can bypass free-form model answering,
- query the system of record directly,
- return text and `report-json` grounded in verified rows.

This is the clearest proof-of-concept for a DB-first execution pipeline.

### 4a. Lightweight EnMS semantic graph contract
The EnClaw EnMS domain adapter now has a lightweight semantic graph registry:

- implementation: `apps/web/lib/enms-semantic-graph.ts`
- scope: capability / metric / formula / fact-path / chart / knowledge relation mapping
- rollout: `ENMS_SEMANTIC_GRAPH_SHADOW=true` first, then controlled enable
  with `ENMS_SEMANTIC_GRAPH_ENABLED=true`
- controlled rollout: optional
  `ENMS_SEMANTIC_GRAPH_CAPABILITIES=same_slot_demand,daily_peak_demand_point,site_benchmarking`
- runtime metadata: semantic graph plans report `coverage` as `complete`,
  `partial`, or `none`, plus missing/skipped contract keys, so controlled
  rollout cannot look fully enabled when only part of the contract is active.
- integrity check: regression tests validate that graph edges resolve to known
  nodes, all required EnMS obligations have contracts, and the graph does not
  contain customer MACs, raw table names, or runtime scoped facts.

The graph is **not** a new database and is **not** a new source of truth.
It does not store customer readings, raw time-series, MAC inventories, or authorization facts.

Its purpose is to strengthen the existing eight-core loop:

- EnMS-specific Runtime: expose optional planner metadata behind feature flags
- Context Builder: map natural-language intents into capability contracts
- Context Pack: attach only the required formulas, fact paths, wiki, and playbook references
- Review Flow: route wrong or high-value cases into reviewable drafts
- Data Governance: keep EnMS scoped facts as the only runtime data source
- Analytics Module Integration: bind metrics to vetted formulas and page-level obligations
- Chart Output: bind chart type, units, and fact references to the same obligation
- Wiki Writeback: promote only reviewed learning drafts into durable knowledge

### 5. Reviewable knowledge loop
The learning draft / promotion / writeback flow already shows how answers can be reviewed and promoted into durable system knowledge.

## Where The Current Gaps Are

### Gap A: uneven verified coverage
- EnMS has partial verified execution coverage.
- ERP and Y-CRM currently depend more heavily on model-guided live query behavior.

### Gap B: no formal shared adapter contract in code
Before this step, the repo had the implementation pieces but no formal contract describing:

- source-of-truth policy,
- execution strategy,
- verified coverage level,
- implementation mapping.

### Gap C: chart safety depends on model obedience for some paths
If a question falls outside a verified path, chart generation can still depend on model behavior rather than a guaranteed verified aggregate pipeline.

## The Recommended Product Direction
Future work should move from:

- question-by-question hardcoding

to:

- adapter-by-adapter capability definition.

That means each new system should define:

1. domain routing rules,
2. source-of-truth location,
3. schema / API registry,
4. safe joins and glossary,
5. verified execution entry points,
6. chart/evidence contract,
7. learning/writeback rules.

## Phase Plan

### Phase 1: formalize current state
Completed by this step:

- define a shared domain adapter contract,
- define a registry for EnMS / ERP / Y-CRM,
- document the current architecture and maturity gaps,
- do not change existing runtime behavior.

### Phase 2: extract common execution interfaces
Future step, requires approval if behavior changes are introduced:

- formal query-plan contract,
- shared verified execution interface,
- shared chart rendering contract,
- shared evidence metadata contract.

Semantic graph contracts can become one implementation of the shared query-plan
contract, but should remain lightweight until the registry becomes too large for
versioned TypeScript / JSON definitions.

### Phase 3: expand verified execution coverage
Future step, requires approval:

- add more verified execution paths for EnMS,
- introduce ERP verified direct query coverage for top-value ERP questions,
- introduce Y-CRM verified direct query coverage for top-value CRM questions.

### Phase 4: model-agnostic runtime hardening
Future step, requires approval:

- guarantee the same DB-first behavior regardless of local or cloud model,
- isolate model inference from domain execution logic,
- keep routing / evidence / chart policy stable while models change.

## Investor / IP Framing
This architecture can support a stronger IP narrative than “we integrated a model.”

The core is better framed as:

- governed AI runtime,
- domain adapter framework,
- source-of-truth execution pipeline,
- verified chart/report contract,
- reviewable knowledge promotion flow.

This framing stays compatible with the current implementation and can grow without requiring a full rewrite.
