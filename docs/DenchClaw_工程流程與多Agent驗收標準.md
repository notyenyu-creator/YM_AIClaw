# DenchClaw 工程流程與多 Agent 驗收標準

> 目的：把成熟 AI coding agent 的工程紀律，轉成 DenchClaw 自己可長期遵守的開發、測試、回歸與驗收流程。
>
> 重要邊界：本文件只定義工程工作方式，不改動 DenchClaw 的產品架構，也不改動既有 8 大核心模組。

## 1. 架構不變原則

DenchClaw 的主架構仍維持：

- `OpenClaw Gateway`：入口、session/runtime、工具橋接、模型調用。
- `Hermes-style orchestration`：planner、context builder、context pack、domain pipeline、learning loop 的工作方式。
- `AI Wiki`：wiki、schema、ontology、source-of-truth、playbook、review promotion 的知識層。
- `Domain adapters`：Y-CRM、ERP、EnMS，以及未來 WMS、MES、RFID、EMS，各自保有獨立 domain 邊界。

這份流程參考外部 `agent-skills` 的生命週期與品質門檻，但只吸收工程方法：

- 不引入第二套 runtime。
- 不新增 meta-orchestrator。
- 不讓 persona / agent 彼此呼叫造成資訊轉述與 token 浪費。
- 不把 DenchClaw 的 8 大核心改名或重排。

## 2. DenchClaw 的 8 大核心對齊

每次改動都必須先確認是否影響下列核心。如果沒有影響，要在回報中明確說「未改動」。

| 核心 | 工程檢查重點 |
|---|---|
| 1. Domain-specific Runtime | 是否仍由受控 domain pipeline 執行，而不是讓 prompt 或 client 直接決定資料入口。 |
| 2. Context Builder | 是否正確選 domain、schema、時間窗與資料限制。 |
| 3. Context Pack | 是否只帶必要上下文，避免 token 膨脹與跨 domain 污染。 |
| 4. Review Flow | 是否保留 draft、review、promotion、人工審核路徑。 |
| 5. 資料治理 | 是否維持 server-side env、secret redaction、read-only query、權限邊界。 |
| 6. 分析模組整合 | forecast、anomaly、alert、recommendation 等分析結果是否有來源與驗收條件。 |
| 7. 圖表輸出 | verified rows、chart guardrail、empty state、文字與圖表一致性是否正確。 |
| 8. Wiki Writeback 整合 | 高價值案例是否可進入 wiki / schema / playbook，而不是只留在一次性回答。 |

## 3. 標準生命週期

參考成熟 agent workflow，DenchClaw 每次功能收斂採用六段流程：

```text
定義需求 -> 拆小步 -> 實作一片 -> 驗證證據 -> 多角色審查 -> 等待提交
```

| 階段 | DenchClaw 做法 | 退出條件 |
|---|---|---|
| 定義需求 | 明確說明要改哪個 domain、哪條 pipeline、哪些檔案不能碰。 | 範圍、非範圍、風險已列清楚。 |
| 拆小步 | 每次只做一個可驗收 slice，不把安全、UI、文件、重構混成一包。 | 每一步都有測試與回滾方式。 |
| 實作一片 | 優先做最小可工作的改動，避免預先抽象。 | 系統保持可啟動、可測試。 |
| 驗證證據 | 跑 focused test、domain smoke、cross-domain、chart、model trace。 | 測試結果可貼出，不能只說「看起來正常」。 |
| 多角色審查 | PM、TPM、RD、SRE、QA、UI/UX 分別檢查。 | 沒有 P0/P1 阻斷問題。 |
| 等待提交 | 回報變更、測試、風險。除非使用者要求，不主動 commit。 | 使用者確認後才 commit。 |

## 4. 小步實作規則

每個 slice 只改一件事：

- 安全收斂只做安全，不順手改 UI。
- UI empty state 只做 UI，不順手重構 routing。
- Domain route 穩定化只做 route，不順手改 chart。
- 文件收斂只做文件，不順手改 runtime。

紅旗：

- 一次改超過一條 domain pipeline。
- 改 Y-CRM 時順手碰 ERP / EnMS。
- 為了測試在 `/Users/ym/twenty-ym/tmp` 留 DenchClaw 暫存檔。
- 用 raw connection string、明文密碼或 prompt 內連線資訊。
- 問 ERP 出現 EnMS 回答，或問 Y-CRM 出現 ERP 回答。
- 沒資料卻畫空圖，讓使用者以為圖表已成功分析。

## 5. 測試優先與 Prove-It Pattern

Bug 修復採用「先證明問題，再修正」：

1. 重現問題或新增可覆蓋的測試。
2. 確認測試能抓到錯誤。
3. 做最小修正。
4. 跑 focused regression。
5. 跑 cross-domain regression。
6. 修正後才宣告完成。

如果是純文件或靜態內容，可以不用新增程式測試，但仍要做：

- 拼字與術語檢查。
- UI/UX 閱讀檢查。
- 架構邊界檢查。
- 不出現「對自己備忘」或低階 demo 語句。

## 6. 多角色驗收標準

每次功能修改完成後，固定用六角色 review：

| 角色 | 必看問題 | 產出 |
|---|---|---|
| PM | 使用者是否看得懂？缺資料時是否友善？功能價值是否清楚？ | 使用者價值與文案風險。 |
| TPM | phase、依賴、交付邊界、風險是否清楚？ | 可交付性與下一步。 |
| RD | 架構是否保持簡單？domain 是否混線？重複邏輯是否擴散？ | code health 與重構建議。 |
| SRE | secret、env、redaction、runtime error、啟動流程是否安全？ | 運維與安全風險。 |
| QA | Y-CRM / ERP / EnMS / cross-domain / chart / model trace 是否回歸？ | 測試結果與殘餘風險。 |
| UI/UX | tag、badge、empty state、文件版面是否清楚？ | 可讀性與介面問題。 |

審查原則：

- 角色提供獨立觀點，不互相代答。
- 主流程負責合併結論。
- 不建立「Agent 叫 Agent」的巢狀流程。
- 如果需要多角色，採平行 fan-out 後由主流程合併。

## 7. DenchClaw Definition of Done

每次任務完成前，至少要符合：

- 只修改 `/Users/ym/DenchClaw` 目標檔案。
- 沒有新增 Y-CRM / ERP 專案內的 DenchClaw 暫存、測試產物或臨時檔。
- 沒有明文 DB password、API key、token。
- Y-CRM、ERP、EnMS domain routing 沒有混線。
- Chart 有資料才畫圖；沒資料要說明日期、範圍與 fallback。
- 模型來源與資料來源能區分，例如 DB 直查、GX10 本地模型、雲端模型。
- Focused tests 通過。
- 需要時 full web tests 通過。
- `git diff --check` 通過。
- 若有 shell / python 腳本，語法檢查通過。
- 六角色 review 沒有 P0/P1 阻斷問題。

## 8. 推薦測試矩陣

| 類型 | 目的 |
|---|---|
| Focused unit tests | 驗證本次改動的最小邏輯。 |
| Domain smoke tests | Y-CRM、ERP、EnMS 各一題代表查詢。 |
| Cross-domain tests | 問 ERP 不跑 EnMS，問 Y-CRM 不跑 ERP。 |
| Chart tests | 有資料、無資料、query error、欄位 mapping error。 |
| Model trace tests | DB 直查、GX10 本地模型、gpt-4.1-mini 雲端模型。 |
| Security tests | unsafe SQL、raw connection string、secret redaction。 |
| UI tests | badge、tooltip、empty state、sidebar tag；使用者需能一眼分辨模型來源、資料來源與空資料原因。 |
| Wiki writeback tests | learning draft、review、promotion、playbook 或 schema writeback 路徑。 |

## 9. Scope Discipline

不在本任務範圍內的問題，只列為後續建議，不順手修。

範例：

```text
NOTICED BUT NOT TOUCHING:
- 某份舊文件仍有過時 DuckDB 範例，應排在文件收斂 phase。
- 某個 domain adapter 還是硬寫 ycrm/erp/enms，未來 WMS/MES/RFID/EMS 建議抽 registry。
- 某些 repo-wide lint 是既有問題，若非本次改動造成，不混進本次修復。
```

這條規則是為了避免「修一個 bug，帶出三個不相關改動」，讓 Y-CRM、ERP、EnMS 的穩定性被稀釋。

## 10. 和外部 agent-skills 的對應

DenchClaw 吸收的是工程方法，不是直接搬 repo：

| 外部做法 | DenchClaw 對應 |
|---|---|
| Define / Plan / Build / Verify / Review / Ship | 定義需求 / 拆小步 / 實作一片 / 驗證證據 / 六角色審查 / 等待提交 |
| Incremental implementation | 每次只做一個 domain-safe slice |
| Test-driven development | Bug fix 要有 reproduction 或 focused regression |
| Code review five axes | RD + SRE + QA + UI/UX + PM/TPM 多角度驗收 |
| Progressive disclosure | Context pack 只載必要資訊，降低 token 與混線風險 |
| Anti-rationalization | 明列紅旗與不能跳過的驗證證據 |

## 11. 常用術語

| 術語 | 中文說明 |
|---|---|
| runtime | 執行層；實際負責呼叫工具、查資料、串接模型與保存 session 的程式層。 |
| domain pipeline | 領域流程；Y-CRM、ERP、EnMS 等各自的受控查詢、分析與回覆流程。 |
| verified direct query | 已驗證直查；由 server-side runtime 直接查可信資料來源，不讓模型自行編造資料。 |
| context builder | 上下文建構器；決定 domain、schema、時間窗、資料限制與可用來源。 |
| context pack | 上下文包；送進模型或回答流程前的最小必要資訊集合。 |
| report-json | 圖表描述格式；用於讓回答產生可渲染的圖表。 |
| guardrail | 安全護欄；限制模型、查詢、圖表或控制命令不能越界的規則。 |
| regression | 回歸測試；確保新修改沒有破壞既有 Y-CRM / ERP / EnMS 功能。 |

## 12. 參考來源

以下來源只作為工程流程參考，不是 DenchClaw 的 runtime dependency，也不是要求照搬外部 repo 架構。

- addyosmani/agent-skills: https://github.com/addyosmani/agent-skills
- Incremental Implementation: https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/incremental-implementation/SKILL.md
- Test-Driven Development: https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/test-driven-development/SKILL.md
- Code Review and Quality: https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/code-review-and-quality/SKILL.md
- Orchestration Patterns: https://raw.githubusercontent.com/addyosmani/agent-skills/main/references/orchestration-patterns.md
