# Y-CRM Context Builder Prototype Test Cases v0.1

> 狀態：初始骨架
> 更新日期：2026-04-16
> 類型：文件驅動 prototype test cases
> 對應文件：
> - `schema/prototype-contracts/ycrm-context-builder.md`
> - `schema/context-builders/ycrm.md`
> - `schema/context-builder-examples/ycrm.md`
> - `schema/routing-checklists/ycrm.md`

## 1. 目的

這份文件的目的是為 `Y-CRM context builder prototype contract` 提供一組可重複執行的測試案例。

它的重點不是驗證最終答案內容，而是驗證 builder 的決策是否穩定：

- 有沒有正確進入 Y-CRM
- `intent` 是否判對
- workspace 是否解析對
- 該不該要求 `auto-schema`
- 該不該要求 `workspaceMember`
- 該不該升級成跨系統 handoff
- 該不該產生 warning / blocker

---

## 2. 測試方式

每個 test case 都由 3 部分組成：

1. `input`
2. `expected assertions`
3. `failure signals`

驗證原則：

1. 只檢查 contract 欄位，不檢查最終自然語言回答。
2. 只要關鍵 assertion 不符，就視為失敗。
3. 若 builder 回傳了額外資訊，只要不違反既有 contract，可接受。

---

## 3. Base Runtime State

除非個別案例另有說明，預設使用以下 runtime state：

```yaml
runtime_state:
  available_wiki_pages:
    - wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md
    - wiki/entities/opportunities/YCRM_OPPORTUNITY_SUMMARY_TEMPLATE.md
    - wiki/operations/ycrm/YCRM_LINE_INTERACTION_SUMMARY_TEMPLATE.md
  available_playbooks:
    - wiki/playbooks/ycrm/YCRM_SALES_ANALYSIS_PLAYBOOK_TEMPLATE.md
  known_memory_keys:
    - known_rule:person_name_is_not_workspace
    - preference:chart_style
    - preference:followup_style
  available_auto_schema_workspaces:
    - workspace_3joxkr9ofo5hlxjan164egffx
defaults:
  default_workspace_id: workspace_3joxkr9ofo5hlxjan164egffx
```

---

## 4. Positive Cases

### TC-01 Product Help

#### Input

```yaml
request:
  user_message: "Y-CRM 的 LINE 自動回覆要怎麼設定？"
  current_system_hint: null
  requested_workspace: null
  user_locale: zh-TW
```

#### Expected Assertions

- `decision.should_route_to_ycrm = true`
- `decision.intent = product_help`
- `workspace.resolved_workspace_id = workspace_3joxkr9ofo5hlxjan164egffx`
- `live_requirements.real_query_required = false`
- `live_requirements.auto_schema_required = false`
- `handoff.cross_system = false`

#### Failure Signals

- 錯誤要求 live query
- 錯誤要求 `auto-schema`
- 錯誤分類成 `entity_summary`

### TC-02 Entity Summary With Person Name

#### Input

```yaml
request:
  user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。"
  current_system_hint: ycrm
  requested_workspace: null
  user_locale: zh-TW
```

#### Expected Assertions

- `decision.should_route_to_ycrm = true`
- `decision.intent = entity_summary`
- `workspace.source = explicit_ycrm`
- `workspace.resolved_workspace_id = workspace_3joxkr9ofo5hlxjan164egffx`
- `live_requirements.real_query_required = true`
- `live_requirements.auto_schema_required = true`
- `live_requirements.workspace_member_lookup_required = true`
- `handoff.cross_system = false`

#### Failure Signals

- 把 `Calleen Hong` 誤認成 workspace
- 忘記標記 `workspace_member_lookup_required`
- 沒要求 `auto-schema`

### TC-03 Sales Report With Chart

#### Input

```yaml
request:
  user_message: "幫我分析 Y-CRM 裡許子新的商機分布，順便做成圖表。"
  current_system_hint: ycrm
  requested_workspace: null
  user_locale: zh-TW
```

#### Expected Assertions

- `decision.intent = sales_report`
- `live_requirements.real_query_required = true`
- `live_requirements.auto_schema_required = true`
- `live_requirements.workspace_member_lookup_required = true`
- `live_requirements.report_json_values_required = true`
- `context_bundle.references` 需包含 `analysis-templates.md`
- `handoff.cross_system = false`

#### Failure Signals

- 沒標記 `report_json_values_required`
- 沒要求 `workspaceMember`
- 沒載入 `analysis-templates.md`

### TC-04 LINE Interaction Review

#### Input

```yaml
request:
  user_message: "幫我看一下這個客戶最近的 LINE 對話重點，還有下一步要追什麼。"
  current_system_hint: null
  requested_workspace: null
  user_locale: zh-TW
```

#### Expected Assertions

- `decision.intent = line_interaction_review`
- `live_requirements.real_query_required = true`
- `live_requirements.auto_schema_required = true`
- `live_requirements.workspace_member_lookup_required = false`
- `context_bundle.wiki` 需包含 `YCRM_LINE_INTERACTION_SUMMARY_TEMPLATE.md`
- `handoff.cross_system = false`

#### Failure Signals

- 沒把 LINE 類問題導到 Y-CRM
- 缺少客戶 / LINE wiki 上下文
- 錯誤要求 `workspaceMember`

### TC-05 Cross-System Escalation

#### Input

```yaml
request:
  user_message: "這個客戶在 Y-CRM 裡商機很熱，但我想知道他的訂單現在到哪、庫存夠不夠、還有工單有沒有卡住。"
  current_system_hint: ycrm
  requested_workspace: null
  user_locale: zh-TW
```

#### Expected Assertions

- `decision.should_route_to_ycrm = true`
- `decision.intent = cross_system_request`
- `handoff.cross_system = true`
- `handoff.target_systems` 包含 `erp`
- `handoff.target_systems` 包含 `wms`
- `handoff.target_systems` 包含 `mes`
- `notes.blockers` 包含 `cross_system_required`

#### Failure Signals

- 只停在 Y-CRM
- 沒標出 cross-system handoff
- 漏掉 `erp` / `wms` / `mes`

### TC-06 Low-Risk Write Intent

#### Input

```yaml
request:
  user_message: "請幫我在 Y-CRM 幫這個客戶新增一筆跟進備註，內容是下週一回覆報價版本。"
  current_system_hint: ycrm
  requested_workspace: null
  user_locale: zh-TW
```

#### Expected Assertions

- `decision.intent = write_intent`
- `live_requirements.real_query_required = true`
- `live_requirements.auto_schema_required = true`
- `live_requirements.rest_write_required = true`
- `live_requirements.readback_required = true`
- `risk.level = L1`
- `handoff.cross_system = false`

#### Failure Signals

- 忘記要求回讀確認
- 把低風險寫入誤標為 `L0`
- 誤判成跨系統

---

## 5. Negative And Edge Cases

### TC-07 Workspace Unresolved

#### Input

```yaml
request:
  user_message: "請幫我看 Calleen公司 裡面 Y-CRM 的這筆客戶資料。"
  current_system_hint: null
  requested_workspace: null
  user_locale: zh-TW
runtime_state:
  available_auto_schema_workspaces:
    - workspace_3joxkr9ofo5hlxjan164egffx
```

#### Expected Assertions

- `decision.should_route_to_ycrm = true`
- `workspace.source = unresolved` 或 `workspace.needs_workspace_validation = true`
- `notes.warnings` 包含 `person_name_may_be_misread_as_workspace` 或等價訊號

#### Failure Signals

- 未驗證就直接指定錯誤 workspace
- 沒留下任何 warning

### TC-08 Auto-Schema Missing

#### Input

```yaml
request:
  user_message: "幫我整理 HOPET 工作區裡最近一週的新商機。"
  current_system_hint: ycrm
  requested_workspace: workspace_5sgeef4h8tfcbqihsmg9numuh
  user_locale: zh-TW
runtime_state:
  available_auto_schema_workspaces:
    - workspace_3joxkr9ofo5hlxjan164egffx
```

#### Expected Assertions

- `decision.intent = entity_summary` 或 `unknown`
- `workspace.resolved_workspace_id = workspace_5sgeef4h8tfcbqihsmg9numuh`
- `notes.blockers` 包含 `auto_schema_missing`
- `live_requirements.auto_schema_required = true`

#### Failure Signals

- 明知沒有 `auto-schema` 還裝作可直接查
- 沒標記 blocker

### TC-09 Unknown Intent

#### Input

```yaml
request:
  user_message: "把這段內容整理得更有說服力。"
  current_system_hint: null
  requested_workspace: null
  user_locale: zh-TW
```

#### Expected Assertions

- `decision.should_route_to_ycrm = false` 或 `decision.intent = unknown`
- `notes.warnings` 或 `notes.blockers` 留痕

#### Failure Signals

- 亂路由到 Y-CRM
- 硬分類成 `entity_summary`

### TC-10 Missing Wiki Falls Back Cleanly

#### Input

```yaml
request:
  user_message: "幫我看一下這個客戶最近的 LINE 對話重點。"
  current_system_hint: ycrm
  requested_workspace: null
  user_locale: zh-TW
runtime_state:
  available_wiki_pages: []
```

#### Expected Assertions

- `decision.intent = line_interaction_review`
- `live_requirements.real_query_required = true`
- `notes.warnings` 包含 `wiki_not_found_fallback_to_live_query`

#### Failure Signals

- 因為沒有 wiki 就中止 routing
- 不留任何 fallback 訊號

---

## 6. Regression Matrix

每次調整 builder 規則後，至少回跑以下矩陣：

| 類型 | 測試案例 | 必守重點 |
|------|----------|----------|
| 產品問答 | `TC-01` | 不打 DB |
| 客戶摘要 | `TC-02` | 人名不誤當 workspace |
| 圖表分析 | `TC-03` | `VALUES` 必須標記 |
| LINE 摘要 | `TC-04` | LINE -> Y-CRM |
| 跨系統 | `TC-05` | handoff 必須成立 |
| 寫入 | `TC-06` | 回讀確認 |
| workspace 邊界 | `TC-07` | unresolved 要留痕 |
| schema 邊界 | `TC-08` | missing 要 blocker |
| 非 Y-CRM 題 | `TC-09` | 不亂路由 |
| wiki fallback | `TC-10` | 缺 wiki 不崩 |

---

## 7. 初版通過標準

初版 prototype 只有在以下條件都成立時，才算通過：

1. `TC-01` 到 `TC-06` 全部通過。
2. `TC-07` 到 `TC-10` 沒有出現 silent failure。
3. 所有需要 `auto-schema` 的案例，都正確標記 `auto_schema_required = true`。
4. 所有涉及人名的案例，都正確處理 `workspace_member_lookup_required` 或 unresolved warning。
5. 所有跨系統案例，都正確標記 `handoff.cross_system = true`。

---

## 8. 下一步

這份 test cases 完成後，建議下一步是：

1. 做 `Y-CRM context builder prototype scorecard`
2. 或直接開始寫最小純函式骨架，並把這 10 題轉成實際 fixture
