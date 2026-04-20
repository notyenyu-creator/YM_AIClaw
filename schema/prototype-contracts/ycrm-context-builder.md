# Y-CRM Context Builder Prototype Contract v0.1

> 狀態：初始骨架
> 更新日期：2026-04-16
> 類型：文件驅動 prototype contract
> 對應文件：
> - `schema/context-builders/ycrm.md`
> - `schema/context-builder-examples/ycrm.md`
> - `schema/routing-checklists/ycrm.md`

## 1. 目的

這份 contract 的目的是把 `Y-CRM context builder` 從概念文件再往前推一步，定義成一個可被實作的 prototype 介面。

它要回答的是：

- 這個 builder 吃什麼輸入？
- 它要吐出什麼結果？
- 哪些欄位是必要的？
- 哪些欄位只是輔助資訊？
- 失敗時應怎麼表示？
- 後續若做程式化 routing，最小骨架應長什麼樣？

這份文件先不綁定任何特定語言或 runtime，只定義 contract。

---

## 2. Prototype 範圍

初版 prototype 只處理：

1. `Y-CRM first` 任務判斷
2. 任務分類
3. 工作區解析
4. 最小上下文包組裝
5. live query 需求標記
6. cross-system handoff 判斷

初版 prototype 不處理：

1. 真正執行 DuckDB 查詢
2. 真正呼叫 REST API
3. 真正讀寫 wiki
4. 真正讀寫 memory
5. 真正派發到其他系統

也就是說，它目前先是「決策與封包層」，不是「執行層」。

---

## 3. Prototype 介面

### 3.1 邏輯名稱

- logical id: `ycrm_context_builder`
- version: `v0.1`

### 3.2 呼叫方式

可視為一個純函式：

```text
buildYcrmContext(input) -> output
```

輸入是一次任務請求與少量系統狀態。
輸出是一份標準化的 context plan。

---

## 4. 輸入 Contract

### 4.1 最小輸入結構

```yaml
request:
  user_message: string
  current_system_hint: string | null
  requested_workspace: string | null
  user_locale: string | null
runtime_state:
  available_wiki_pages: string[]
  available_playbooks: string[]
  known_memory_keys: string[]
  available_auto_schema_workspaces: string[]
defaults:
  default_workspace_id: string
```

### 4.2 欄位說明

#### `request.user_message`

必要欄位。使用者原始問題。

#### `request.current_system_hint`

可選欄位。若上游 router 已預判這題可能跟 `ycrm` 有關，可帶入 `ycrm`。

#### `request.requested_workspace`

可選欄位。若 UI、使用者設定或上游流程已指定 workspace，可直接傳入。

#### `request.user_locale`

可選欄位。初版可忽略，但保留作為未來多語環境欄位。

#### `runtime_state.available_wiki_pages`

目前可用 wiki 頁清單，用來判斷是否能組裝 wiki 上下文。

#### `runtime_state.available_playbooks`

目前可用 playbook 清單。

#### `runtime_state.known_memory_keys`

目前可用 memory key 清單，不直接放記憶內容，只放可檢索 key。

#### `runtime_state.available_auto_schema_workspaces`

哪些 workspace 已經有對應 `auto-schema`。

#### `defaults.default_workspace_id`

預設值應是 `workspace_3joxkr9ofo5hlxjan164egffx`。

---

## 5. 輸出 Contract

### 5.1 最小輸出結構

```yaml
builder:
  id: ycrm_context_builder
  version: v0.1
decision:
  should_route_to_ycrm: boolean
  confidence: low | medium | high
  intent: product_help | entity_summary | opportunity_analysis | line_interaction_review | sales_report | write_intent | cross_system_request | unknown
workspace:
  resolved_workspace_id: string | null
  source: explicit | explicit_ycrm | default | unresolved
  needs_workspace_validation: boolean
context_bundle:
  rules: string[]
  references: string[]
  wiki: string[]
  playbooks: string[]
  memory_keys: string[]
live_requirements:
  real_query_required: boolean
  auto_schema_required: boolean
  workspace_member_lookup_required: boolean
  report_json_values_required: boolean
  rest_write_required: boolean
  readback_required: boolean
risk:
  level: L0 | L1 | L2 | L3
  human_confirmation_required: boolean
handoff:
  cross_system: boolean
  target_systems: string[]
notes:
  warnings: string[]
  blockers: string[]
```

### 5.2 輸出欄位語義

#### `decision.should_route_to_ycrm`

代表這次問題是否應先交由 Y-CRM builder 處理。

#### `decision.confidence`

僅表示路由判斷把握度，不表示答案正確率。

#### `decision.intent`

初版只允許落在既有 7 種 intent 或 `unknown`。

#### `workspace.source`

可用值：

- `explicit`: 使用者或上游已明確指定 workspace
- `explicit_ycrm`: 使用者明確提到 Y-CRM
- `default`: 使用預設 workspace
- `unresolved`: 尚未能安全判斷

#### `context_bundle.rules`

固定放規則性文件，例如：

- `skills/ycrm/SKILL.md`
- `schema/integration-profiles/ycrm.md`

#### `context_bundle.references`

根據任務類型載入的 reference。

#### `context_bundle.wiki`

本次應優先看的 wiki 頁。

#### `context_bundle.playbooks`

本次應優先看的 playbook。

#### `context_bundle.memory_keys`

只放 key，不直接放內容，讓後續 memory layer 決定是否展開。

#### `live_requirements`

不是要真的執行，而是宣告後續執行層應補什麼。

#### `risk`

給寫入流程與人工確認機制使用。

#### `handoff`

表示是否應升級成跨系統任務。

#### `notes`

用來保存 guardrail 告警、欄位不足、workspace 未解析等訊號。

---

## 6. 最小行為規則

### Rule 1. 先判斷是否進 Y-CRM

若問題主體是客戶、商機、業務活動、LINE 互動或 Y-CRM 產品功能，`should_route_to_ycrm` 應為 `true`。

### Rule 2. 先分類，再決定上下文

分類錯誤時，不應假裝已完成上下文組裝，應把 `intent` 標成 `unknown` 或保守類型，並在 `notes.warnings` 留痕。

### Rule 3. 工作區不穩時不得裝作已確定

若 workspace 來源模糊，`workspace.source` 應為 `unresolved`，並把 `needs_workspace_validation` 設為 `true`。

### Rule 4. 需要真實數據時必須要求 auto-schema

凡是 `entity_summary`、`opportunity_analysis`、`line_interaction_review`、`sales_report`、`write_intent`，只要需要 live data，`auto_schema_required` 應為 `true`。

### Rule 5. 人名查詢必須標記 member lookup

若問題包含業務人名、成員或負責人，`workspace_member_lookup_required` 應為 `true`。

### Rule 6. 圖表任務必須標記 VALUES

若 intent 是 `sales_report` 且輸出包含圖表，`report_json_values_required` 應為 `true`。

### Rule 7. 低風險寫入也要回讀

若 intent 是 `write_intent`，至少：

- `rest_write_required: true`
- `readback_required: true`

### Rule 8. 跨系統題目仍可先進 Y-CRM

若問題同時問客戶背景與訂單/庫存/工單狀態，`should_route_to_ycrm` 仍可為 `true`，但 `handoff.cross_system` 也必須為 `true`。

---

## 7. 錯誤與不完整狀態

初版 prototype 不應拋出複雜例外，優先回傳「可觀察的不完整狀態」。

### 7.1 常見 blockers

- `workspace_unresolved`
- `intent_unknown`
- `auto_schema_missing`
- `required_reference_missing`
- `cross_system_required`

### 7.2 常見 warnings

- `person_name_may_be_misread_as_workspace`
- `wiki_not_found_fallback_to_live_query`
- `memory_not_available`
- `chart_request_requires_real_data_first`

---

## 8. 範例輸入 / 輸出

### 8.1 客戶摘要範例

```yaml
input:
  request:
    user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。"
    current_system_hint: ycrm
    requested_workspace: null
    user_locale: zh-TW
  runtime_state:
    available_wiki_pages:
      - wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md
    available_playbooks: []
    known_memory_keys:
      - known_rule:person_name_is_not_workspace
    available_auto_schema_workspaces:
      - workspace_3joxkr9ofo5hlxjan164egffx
  defaults:
    default_workspace_id: workspace_3joxkr9ofo5hlxjan164egffx
```

```yaml
output:
  builder:
    id: ycrm_context_builder
    version: v0.1
  decision:
    should_route_to_ycrm: true
    confidence: high
    intent: entity_summary
  workspace:
    resolved_workspace_id: workspace_3joxkr9ofo5hlxjan164egffx
    source: explicit_ycrm
    needs_workspace_validation: false
  context_bundle:
    rules:
      - skills/ycrm/SKILL.md
      - schema/integration-profiles/ycrm.md
    references:
      - skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md
    wiki:
      - wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md
    playbooks: []
    memory_keys:
      - known_rule:person_name_is_not_workspace
  live_requirements:
    real_query_required: true
    auto_schema_required: true
    workspace_member_lookup_required: true
    report_json_values_required: false
    rest_write_required: false
    readback_required: false
  risk:
    level: L0
    human_confirmation_required: false
  handoff:
    cross_system: false
    target_systems: []
  notes:
    warnings: []
    blockers: []
```

### 8.2 跨系統範例

```yaml
output:
  decision:
    should_route_to_ycrm: true
    confidence: high
    intent: cross_system_request
  handoff:
    cross_system: true
    target_systems:
      - erp
      - wms
      - mes
  notes:
    warnings:
      - ycrm_provides_only_commercial_context_here
    blockers:
      - cross_system_required
```

---

## 9. 初版驗收標準

這份 contract 初版應能支撐以下驗收：

1. 能從同一題輸出穩定的 `intent`。
2. 能清楚標示是否需要 `auto-schema`。
3. 能把人名查詢轉成 `workspace_member_lookup_required`。
4. 能把圖表任務轉成 `report_json_values_required`。
5. 能把跨系統題目標成 `handoff.cross_system = true`。
6. 能在資訊不足時產生 `warnings` 或 `blockers`，而不是假裝已解析完成。

---

## 10. 下一步

這份 contract 完成後，建議下一步是二選一：

1. 建立 `Y-CRM context builder prototype test cases`
2. 或開始做最小程式骨架，先實作 `input -> output plan` 的純函式版本
