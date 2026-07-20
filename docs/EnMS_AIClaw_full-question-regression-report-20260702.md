# EnMS AIClaw 全題庫實測與六角色回歸報告

- 測試日期：2026-07-02
- 測試目標：DenchClaw local web `http://127.0.0.1:3200`
- 測試範圍：24 題 EnMS 題庫、修正前三域 route smoke、DB env/smoke gate、focused regression、UI 截圖抽查
- 原始測試暫存：`/private/tmp/denchclaw-enms-full-regression-20260702.json`
- 修正後重跑暫存：`/private/tmp/denchclaw-enms-full-regression-20260702-after-fixes.json`
- UI 截圖暫存：`/private/tmp/denchclaw-ui-regression-20260702.png`

## Executive Summary

本報告分成兩段：第一段是修正前的 24 題 live findings，第二段是修正後重跑結果。

修正後重跑結果顯示，EnMS route、`lastAnswerMeta`、chart guardrail 與安全降級都已穩定：24 題全部命中 EnMS，全部有 metadata，G01 不再輸出未授權 `report-json`。但是本次重啟後 runtime 沒有帶到 `ENMS_PG_CONNECTION` 等 DB env，因此所有題目都安全降級成 `system_direct`，不能把這輪視為「DB 查詢內容已完整驗收」。

最新判斷：程式 guardrail 可進下一步；資料內容驗收必須先補 runtime DB env、通過 DB smoke，再重跑 24 題。

### 結果摘要

| 分類 | 數量 | 說明 |
|---|---:|---|
| 修正後 route/meta/guardrail PASS_FAIL_CLOSED | 24 | 24 題都命中 EnMS、都有 `lastAnswerMeta`、無 `無資料 至 無資料`、無未授權圖表；但因缺 DB env 皆安全停查。 |
| 修正後 DB 內容驗收 | 0 | runtime DB env 缺失，系統安全停查；需補 env 後重跑。 |
| 修正前 NEEDS_FIX | 3 | D03/E08 site fallback 與 G01 chart guardrail，已以程式與測試修正。 |
| focused regression | 176 | 8 個測試檔、176 tests passed。 |

### 現在可以測什麼

- Domain route：EnMS 題目會命中 EnMS，不會外溢到 Y-CRM / ERP。
- Source metadata：session 會落 `lastAnswerMeta`，可以分辨 `system_direct`、domain 與 model class。
- Fail-closed：DB env 缺失時會停止查詢，不會用模型猜答案。
- Chart guardrail：`chart_render_allowed=false` 時，live stream 與 persisted message 都不會保留未授權 `report-json`。

### 現在還不能測什麼

- DB-first 內容正確性：目前 runtime 沒有 DB connection env，因此沒有真正查到 EnMS DB。
- D03 / E08 真實資料情境：site-scoped latest available fallback 已有單元測試，但 live 仍需 DB env 後重驗。
- G01 真實資料情境：非圖表題不出圖已補 live stream 測試，但資料可用時的回答品質仍要重跑。
- 模型替代能力：這輪沒有測 GX10 vs gpt-4.1-mini，因為資料入口尚未就緒。

### 下一輪解鎖條件

- EnMS 內容驗收先補 `ENMS_PG_CONNECTION` 與 `ENMS_PG_ALLOWED_HOST` / `ENMS_PG_ALLOWED_PORT` / `ENMS_PG_ALLOWED_DATABASE`。
- Y-CRM / ERP 可在三域 smoke 前補 `YCRM_PG_CONNECTION`、`ERP_PG_CONNECTION`，不應阻塞 EnMS 單線內容驗收。
- EnMS 單線內容驗收先跑 `bash scripts/check-domain-db-env.sh --domain enms --strict`；三域 smoke 前再跑 `bash scripts/check-domain-db-env.sh --domain all --strict`。
- `check-domain-db-env.sh` 是 DB env / secret wiring preflight，只確認 runtime env key 已設定且不像 placeholder；它不等同 DB 連線、帳密、TLS、schema/table 可讀性已驗證。
- env preflight 通過後，接著跑 `bash scripts/check-domain-db-smoke.sh --domain enms --strict` 做真正 read-only connection/schema smoke；三域 smoke 前再跑 `--domain all --strict`。`--domain` 必填，避免 EnMS 單線內容驗收被誤用成三域 gate。
- 補 env 後重跑 24 題，才可重新判定 DB 直查、圖表資料、no-data fallback 與資料新鮮度。

## 8 大核心影響檢查

| 核心模組 | 本輪影響 | 驗證狀態 |
|---|---|---|
| EnMS-specific Runtime 擴充 | 維持既有 domain runtime，新增 fail-closed 與 metadata 穩定性驗證。 | focused tests + live fail-closed rerun 通過。 |
| Context Builder | 未重構；僅沿用 `chart_render_allowed` 作為 server-side guardrail 訊號。 | chat-session planner integration 通過。 |
| Context Pack | 未改主要內容；新增 trace flag 消費 context pack 的 chart policy。 | EnMS context pack 既有測試仍在 modified set，需全量回歸時再覆蓋。 |
| Review Flow | 未改 review queue / promotion 流程。 | 無本輪行為變更。 |
| 資料治理 | 補 Y-CRM / ERP error redaction；啟動腳本補 DB env warning。 | domain-db-config tests 通過；live DB redaction 待 env 後 smoke。 |
| 分析模組整合 | 未新增分析模型；保留 DB-first / deterministic direct / model run 分層。 | 24 題 metadata 可分辨 `system_direct`。 |
| 圖表輸出 | 補 live stream + persisted report-json suppression，避免未授權圖表。 | active-runs + report-blocks tests 通過。 |
| Wiki Writeback 整合 | 未改 wiki / learning writeback。 | 無本輪行為變更。 |

## 修正後 Live Rerun

重跑時間：2026-07-02 12:35 Asia/Taipei。  
服務狀態：standalone rebuild + restart 成功，`http://127.0.0.1:3200/` 回 200。  
重要限制：目前 shell 與 DenchClaw `.env` / `.env.local` 都沒有 DB connection env，因此此輪是「安全降級驗收」，不是「資料內容驗收」。
表格狀態 `PASS_FAIL_CLOSED` 表示 route / metadata / guardrail 正確、且在 DB env 缺失時安全停查；不代表 DB 內容回答已驗收。

| ID | 類型 | 狀態 | answerMode | modelClass | domain | 圖表 | Session | 備註 |
|---|---|---|---|---|---|---|---|---|
| D01 | core | PASS_FAIL_CLOSED | system_direct | none | enms | no | `17ff931a-8b3e-4a65-9347-3aceb220f8ca` | route/meta/guardrail ok；DB env fail-closed |
| D02 | core | PASS_FAIL_CLOSED | system_direct | none | enms | no | `331db55c-671e-4b83-b0b7-f68f424ea3fe` | route/meta/guardrail ok；DB env fail-closed |
| D03 | core | PASS_FAIL_CLOSED | system_direct | none | enms | no | `09b6cfc3-4320-49d0-b98f-4710da681504` | route/meta/guardrail ok；DB env fail-closed |
| D04 | core | PASS_FAIL_CLOSED | system_direct | none | enms | no | `d2bffec5-6d3d-4097-ad5b-972d7c44a4dc` | route/meta/guardrail ok；DB env fail-closed |
| D05 | core | PASS_FAIL_CLOSED | system_direct | none | enms | no | `0cbfc5e2-a2d0-447d-b7e1-5e2cb9e64b9f` | route/meta/guardrail ok；DB env fail-closed |
| D06 | core | PASS_FAIL_CLOSED | system_direct | none | enms | no | `51ce7cb4-6b4a-4661-a57b-124ffc1905cd` | route/meta/guardrail ok；DB env fail-closed |
| E01 | common | PASS_FAIL_CLOSED | system_direct | none | enms | no | `405476ff-a808-4cf8-b723-606769fbf1f6` | route/meta/guardrail ok；DB env fail-closed |
| E02 | common | PASS_FAIL_CLOSED | system_direct | none | enms | no | `569b9d05-9db5-4871-b92d-85cca09c80a5` | route/meta/guardrail ok；DB env fail-closed |
| E03 | common | PASS_FAIL_CLOSED | system_direct | none | enms | no | `5bf34008-fd7a-4079-a389-ef5e2142bfc2` | route/meta/guardrail ok；DB env fail-closed |
| E04 | common | PASS_FAIL_CLOSED | system_direct | none | enms | no | `9a07975a-937c-4cf5-9513-8521947db53c` | route/meta/guardrail ok；DB env fail-closed |
| E05 | common | PASS_FAIL_CLOSED | system_direct | none | enms | no | `6dd9adf9-0cf1-400a-9f3a-cfa51730500d` | route/meta/guardrail ok；DB env fail-closed |
| E06 | common | PASS_FAIL_CLOSED | system_direct | none | enms | no | `2559d5f7-750e-4850-a759-56b225d8aa74` | route/meta/guardrail ok；DB env fail-closed |
| E07 | common | PASS_FAIL_CLOSED | system_direct | none | enms | no | `8753ff03-b86d-45a4-9f73-9326a9c0967f` | route/meta/guardrail ok；DB env fail-closed |
| E08 | common | PASS_FAIL_CLOSED | system_direct | none | enms | no | `81fa01fd-aefe-4244-8ce2-82c88246add0` | route/meta/guardrail ok；DB env fail-closed |
| E09 | common | PASS_FAIL_CLOSED | system_direct | none | enms | no | `f6dd20b8-5ddb-4b0c-b3d3-acf492295f01` | route/meta/guardrail ok；DB env fail-closed |
| E10 | common | PASS_FAIL_CLOSED | system_direct | none | enms | no | `d36df533-75b1-4717-bb97-e945e349462f` | route/meta/guardrail ok；DB env fail-closed |
| E11 | common | PASS_FAIL_CLOSED | system_direct | none | enms | no | `ac0f4ab6-67fb-4140-9833-0cd249036ca1` | route/meta/guardrail ok；DB env fail-closed |
| E12 | common | PASS_FAIL_CLOSED | system_direct | none | enms | no | `4ebd0259-aad2-4a6c-99cd-c80e355645ce` | route/meta/guardrail ok；DB env fail-closed |
| G01 | general | PASS_FAIL_CLOSED | system_direct | none | enms | no | `5e86a956-a15e-42a2-bc61-bc7231b9a22e` | route/meta/guardrail ok；DB env fail-closed |
| G02 | general | PASS_FAIL_CLOSED | system_direct | none | enms | no | `31b40d8e-8084-4f38-8154-390114109011` | route/meta/guardrail ok；DB env fail-closed |
| G03 | general | PASS_FAIL_CLOSED | system_direct | none | enms | no | `722c1842-3d25-476f-bf3f-469fb70ff98f` | route/meta/guardrail ok；DB env fail-closed |
| G04 | general | PASS_FAIL_CLOSED | system_direct | none | enms | no | `9c90db5d-68ee-4235-9ca2-32eadb713735` | route/meta/guardrail ok；DB env fail-closed |
| G05 | general | PASS_FAIL_CLOSED | system_direct | none | enms | no | `e9419838-8dfa-465a-a544-d7f38f2e891f` | route/meta/guardrail ok；DB env fail-closed |
| G06 | general | PASS_FAIL_CLOSED | system_direct | none | enms | no | `1c87c04d-ee10-4e9f-8e3b-63f8ce570bff` | route/meta/guardrail ok；DB env fail-closed |

## 修正前 Findings（已處理或待資料環境重驗）

### 1. EnMS DB-first 主線可用，但最近 7 天資料新鮮度不足

- 多數題目可以從本地 EnMS DB 回答，沒有改用外部網路資料。
- 目前 raw layer 最新資料約停在 2026-06-15，summary layer 最新資料約停在 2026-06-15。
- 因此 2026-07-02 測「最近 7 天」時，多數題目會落入 no-data / latest available fallback。

### 2. D03 / E08 的 site-scoped fallback 有產品 bug

- 問「阿里山最近 7 天設備 / 迴路耗電排行」時，回答會顯示「無資料 至 無資料」。
- 這不是好的使用者體驗，也不符合「最近 7 天沒有資料時，要提供明確日期與最新可用區間」。
- 全部場域版本可以找出最新可用 7 天並回 Top 4，代表問題較可能在 site-scoped fallback 或 site mapping path。

### 3. G01 圖表 guardrail 未收斂

- G01 未要求圖表，但回答輸出 `report-json`。
- 該 session 的 planner 顯示 `optional_chart_requested=false`、`chart_render_allowed=false`、`max_chart_panels=0`，但仍輸出 2 個 chart panels。
- 圖表 panel 使用 SQL 而不是 verified inline rows，且 SQL 內含未驗證欄位路徑。
- 這會重現「文字有資料、圖表 No data」或圖表誤導的風險。

### 4. Source trace / sidebar badge 目前不能完全信任

- 24 題 live API 讀回的 `lastAnswerMeta` 全部是 unknown / null。
- RD/SRE review 判斷這是觀測性問題：stream 結束後 session index metadata 可能尚未完成寫入，測試太快讀取會拿不到；另外未帶 `modelOverride` 時 requested model 也可能查不到。
- 結論：目前回答內容可測，但「這次到底是 DB 直查 / 系統回答 / 本地模型 / 雲端模型」的 UI/metadata 還需要補強。

### 5. Live ERP smoke 暴露 secret redaction 風險

- 明確 ERP 題會 route 到 ERP，沒有誤跑 EnMS。
- 但 ERP DB 認證失敗時，live 回覆暴露了連線資訊形狀。報告中已遮罩，不保留原始敏感內容。
- 這可能代表目前 3200 runtime 尚未重啟套用 working tree 裡的 redaction/security 變更，或 ERP error path 仍有漏網。

### 6. 回答文字需要避免把「資料不足」講成「正常」

- G01 對「目前阿里山用電」回答「沒有需要特別注意」、「正常範圍內」，但未同步說明最新資料時間。
- 在資料停留於 2026-06-15 的情況下，較安全說法應是「目前可見資料未顯示異常，但資料不是即時，無法證明目前沒有風險」。
- 告警無資料時也應避免暗示真的沒有告警風險，應說「查不到告警紀錄，需確認告警資料是否持續寫入」。

## 24 題結果矩陣

| ID | 類型 | QA 狀態 | answerMode | modelClass | 圖表 | Session | 備註 |
|---|---|---|---|---|---|---|---|
| D01 | core | PASS | unknown | unknown | no | a2745fd8-f4a7-4ab8-b17a-c348eac88a28 | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| D02 | core | PASS | unknown | unknown | no | 5c63d9dd-7560-42c3-890e-2fbd4e25cea3 | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| D03 | core | NEEDS_FIX | unknown | unknown | no | 9718a9ef-3407-4b64-ba08-4c28ac6c2ff1 | site-scoped 最近 7 天無資料時 fallback 顯示「無資料 至 無資料」，需要改成明確 site 資料缺口或提供可用範圍。 |
| D04 | core | PASS | unknown | unknown | no | baaf222c-1ea0-4646-9aee-e71529803b04 | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| D05 | core | PASS | unknown | unknown | no | 134accc1-4d61-4387-8f53-32e5ab36dfc3 | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| D06 | core | PASS_NO_DATA | unknown | unknown | no | 06a6dcf6-6c98-4f46-8a42-d092e369994a | 回答有明確說本地 EnMS DB 無可用帳單/ROI 資料，未編造；但與舊 demo 基準相比需確認資料恢復狀態。 |
| E01 | common | PASS | unknown | unknown | no | 17dc337e-f859-4db1-8e0d-18da793067e1 | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| E02 | common | PASS | unknown | unknown | no | b62cc25e-d4aa-4a5b-afb2-ea5595eef0a0 | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| E03 | common | PASS_NO_DATA | unknown | unknown | no | b0faede1-84ad-403f-b4ea-adb8bc70ed3e | 回答有明確說本地 EnMS DB 無可用帳單/ROI 資料，未編造；但與舊 demo 基準相比需確認資料恢復狀態。 |
| E04 | common | PASS | unknown | unknown | no | b1eb9286-bc86-456b-bc4a-596fd80da09e | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| E05 | common | PASS | unknown | unknown | no | 57e2ec91-8e66-4800-bbb1-30b0508926c8 | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| E06 | common | PASS | unknown | unknown | no | e88d9e78-6dd3-4cf3-b215-13787429be85 | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| E07 | common | PASS | unknown | unknown | no | f3b68bfe-297e-4bf8-97a4-78582462f62c | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| E08 | common | NEEDS_FIX | unknown | unknown | no | 3d1f4b3d-2de2-480e-9078-9d48b39a77db | site-scoped 最近 7 天無資料時 fallback 顯示「無資料 至 無資料」，需要改成明確 site 資料缺口或提供可用範圍。 |
| E09 | common | PASS | unknown | unknown | no | 17f3df0c-2f3d-49ce-94b2-d1579268a337 | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| E10 | common | PASS | unknown | unknown | no | 6357a372-7594-4c63-8f34-669c2051f44d | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| E11 | common | PASS_DATA_STALE | unknown | unknown | no | 4f74dfa6-9d51-4365-9b91-e7bd2502b702 | 正確指出 raw/summary 近 1 天 0 筆，揭露資料管線新鮮度風險。 |
| E12 | common | PASS | unknown | unknown | no | 19d05d03-c4c8-456e-9d0e-9847c5cbcf04 | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| G01 | general | NEEDS_FIX | unknown | unknown | yes | 846740fa-8ec2-4b9c-8f34-cc7eda8f042c | 未要求圖表但輸出 report-json，且 SQL 使用未驗證欄位路徑，屬 chart guardrail 風險。 |
| G02 | general | PASS_WEAK_UX | unknown | unknown | no | bc65ed49-9c73-4ca5-a25a-2ed4a2f0b0fc | 沒有編造且使用本地 EnMS DB，但主管/投資人摘要語氣偏弱，應更明確指出資料新鮮度與覆蓋率風險。 |
| G03 | general | PASS | unknown | unknown | no | d64a00ec-2f85-4165-8b21-b21a43ff1686 | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| G04 | general | PASS | unknown | unknown | no | 28927378-b1af-4dbc-ab0a-16be60c6fd69 | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| G05 | general | PASS | unknown | unknown | no | 4114d30b-7cb7-4dc9-a778-8e310832d33c | 回答可用，無外部資料洩漏、無 SQL/schema error、無等待式回覆。 |
| G06 | general | PASS_WEAK_UX | unknown | unknown | no | 4abf935e-7f07-4a42-8eb1-f6464a0ae6a8 | 沒有編造且使用本地 EnMS DB，但主管/投資人摘要語氣偏弱，應更明確指出資料新鮮度與覆蓋率風險。 |

## 修正前三域 Route Smoke Test

以下為修正前 smoke 摘要，主要用來記錄當時 domain route 與錯誤型態；修正後 DB env 缺失，因此三域真實資料 smoke 仍需在 env presence preflight 通過後重跑。

| Domain | 結果 | 說明 |
|---|---|---|
| Y-CRM | WARN | 題目命中 Y-CRM，但回答偏向流程/合約說明，沒有完成資料摘要。需另做 Y-CRM live data smoke。 |
| ERP | WARN | 明確 ERP 題會 route 到 ERP，但 DB 認證失敗；且錯誤訊息需 redaction。 |
| EnMS | PASS_ROUTE_ONLY | 明確 EnMS 題命中 EnMS，且能在最近 7 天無資料時改用最新可用 7 天；這不是本輪 DB connection/schema smoke pass。 |

## Focused Regression

- `lib/enms-verified-direct-query.test.ts`
- `lib/domain-db-config.test.ts`
- `lib/enms-db-config.test.ts`
- `lib/report-blocks.test.ts`
- `lib/chat-execution-trace.test.ts`
- `lib/active-runs.test.ts`
- `app/components/workspace/chat-sessions-sidebar.test.tsx`
- `app/api/chat/chat-session-planner.integration.test.ts`

結果：8 個測試檔、176 個測試全數通過。

額外驗證：

- `bash -n /Users/ym/DenchClaw/scripts/dench-web-standalone.sh` 通過。
- `bash -n /Users/ym/DenchClaw/scripts/check-domain-db-env.sh` 通過。
- `bash -n /Users/ym/DenchClaw/scripts/check-domain-db-smoke.sh` 通過。
- `bash /Users/ym/DenchClaw/scripts/check-domain-db-env.sh --domain all` 通過；目前正確回報三域 DB env / secret wiring 尚未 ready。
- `bash /Users/ym/DenchClaw/scripts/check-domain-db-env.sh --domain all --strict` 在缺 env 時會 exit 1；可作 CI/release 的 env presence preflight，但不能取代 DB 連線與 schema smoke test。
- 使用假但完整的 env 執行 `check-domain-db-env.sh --domain all --strict` 會回 `env preflight ready`，並提醒下一步要跑 DB connection/schema smoke；輸出只顯示 env key 名稱，不顯示 connection string、host 或 password。
- 第一個 alias 是 placeholder、後續 alias 才是真值時，checker 會選用後續真值；只有 `TODO` / `<...>` 類 placeholder 時會 fail。
- `ENMS_PG_ALLOWED_PORT=notaport` 會回 `invalid_allowlist` 並 exit 1，避免 EnMS allowlist port 非法時被誤判 ready。
- `check-domain-db-smoke.sh --domain all --strict` 在缺 env 時會 exit 1；fake bad connection 會回 `smoke_fail`，且錯誤訊息會遮蔽 URI、host、port、dbname、user、password。
- DB smoke 使用 read-only、輕量 `EXISTS` / information_schema check，不在大型營運表上做完整統計；正式內容品質仍以 24 題題庫回歸驗收。
- EnMS smoke 只接受可與 allowlist 精準比對的 compact libpq keyword connection；URI、`hostaddr=`、`hostaddr =`、`service=`、`SERVICE =` 會被拒絕，避免實際 TCP target 與 allowlist 語意不一致。
- EnMS smoke 也會拒絕 `host =`、`port =`、`dbname =`、`database =` 這類 spaced key override；標準 `host=... port=... dbname=...` 仍會正常進入 read-only DB smoke。
- DB smoke 執行前會清除 ambient libpq env，例如 `PGHOSTADDR`、`PGSERVICE`、`PGHOST`、`PGPORT`，避免 shell 環境覆寫 allowlist 已比對過的 connection target。
- 已用 `PGHOSTADDR` / `PGSERVICE` 模擬 ambient env 繞路，smoke 仍只依 DenchClaw connection string 進行 allowlist 後的 read-only 檢查。
- macOS bash 3.2 相容性已驗證：valid EnMS allowlist + fake DB connection 會進入 DB smoke 並回 `smoke_fail`，不會因 Bash 4+ 語法失敗。
- `allowlist_mismatch` 會顯示精準 evidence；`missing_allowlist`、`placeholder_allowlist`、`invalid_allowlist`、`unsupported_connection_format` 也各自有對應排查方向。
- `bash -x check-domain-db-env.sh` 會立即關閉 xtrace，避免 env 判斷過程把 secret value 印到 CI 或 release log。
- `bash -x check-domain-db-smoke.sh` 會立即關閉 xtrace；standalone startup log redaction 與 smoke error redaction 已覆蓋 `postgres://` / `mongodb://` URI、host、hostaddr、port、dbname、database、user、password、quoted host/user/database、IPv4/IPv6 與 Bearer token 類片段。
- 已用常見 libpq error 片段驗證 redaction：`host "..."`、`user "..."`、`database "..."`、IPv4、IPv6、`hostaddr=`、`dbname=`、`password=` 均會遮罩。
- 已用 libpq quoted / escaped keyword values 驗證 redaction：`host='...'`、`user='u\\' ser'`、`dbname='db\\' name'`、`database=secret\\ db`、`password='x\\' y'` 都會完整遮罩，不會留下 secret tail。
- `password=` 額外保留保守截斷遮罩，避免 malformed 或非典型 error text 留下尾段；此策略會犧牲後半段錯誤細節但優先保護 secrets。
- `bash /Users/ym/DenchClaw/scripts/dench-web-standalone.sh status --port 3200` 回 health ok；非法 port 會被 validation 擋下。
- `git -C /Users/ym/DenchClaw diff --check` 通過。
- `bash /Users/ym/DenchClaw/scripts/dench-web-standalone.sh restart --port 3200 --detach` 完成 rebuild / prepack / restart。
- `curl -I http://127.0.0.1:3200/` 回 200。

2026-07-02 本機 runtime env 與 API smoke：

- 已建立本機 `/Users/ym/DenchClaw/.env`，來源為本機 Docker DB container env；檔案權限為 `600`，且 `.gitignore` 已忽略 `.env`，不會進入版本控制。
- `bash scripts/check-domain-db-env.sh --domain all --strict` 通過：Y-CRM、ERP、EnMS connection env 均 ready；EnMS allowlist ready。
- `bash scripts/check-domain-db-smoke.sh --domain all --strict` 在本機 unrestricted runtime 通過：Y-CRM、ERP、EnMS 均 `smoke_pass`。
- DenchClaw standalone web 已重啟並載入 `.env`；`http://127.0.0.1:3200` 回 `200 OK`。
- EnMS API smoke：題目「最近 7 天最耗電設備 / 迴路」回 `sourceKind=verified_direct`、`sourceDomain=enms`，`lastAnswerMeta.answerMode=verified_direct`、`modelClass=none`、`executionStrategy=verified_direct_query`。
- ERP API smoke：ERP 客戶資料題回 `sourceKind=verified_direct`、`sourceDomain=erp`，`lastAnswerMeta.answerMode=verified_direct`、`modelClass=none`、`executionStrategy=verified_direct_query`。
- Y-CRM API smoke：Y-CRM 公司客戶數量題回 `sourceKind=verified_direct`、`sourceDomain=ycrm`，`lastAnswerMeta.answerMode=verified_direct`、`modelClass=none`、`executionStrategy=verified_direct_query`。
- Y-CRM 背景整理題回 `answerMode=model_run`、`executionStrategy=model_guided_live_query`，屬整理型問題的模型引導查詢路徑，不是 DB env 缺失。

額外補充：第一次使用 `pnpm test -- <files>` 時實際跑到整個 web suite，結果 1837 passed / 5 skipped / 2 failed。2 個失敗位於 Y-CRM debug page session snapshot 測試，與本次 EnMS 題庫無直接關係，但仍應列為整體回歸殘留風險。

## 六角色 Review

### PM

- 修正後系統在 DB env 缺失時會安全停查，不會亂猜答案，這是正確產品行為。
- 但 demo / 驗收時必須先補 DB env，否則使用者只會看到「資料來源未就緒」，無法展示 EnMS 分析價值。
- D03 / E08 的「無資料 至 無資料」已透過單元測試防退化。

### TPM

- 目前仍符合 OpenClaw Gateway + Hermes-style orchestration + AI Wiki 的方向。
- 下一個 gate 是 DB env / secret wiring preflight：EnMS 單線先用 `scripts/check-domain-db-env.sh --domain enms --strict`；三域 smoke 前再用 `--domain all --strict`。
- preflight 之後要接 `scripts/check-domain-db-smoke.sh`，因為 smoke 才會真正驗證 DuckDB postgres_scanner、DB auth、schema/table 可讀性。
- 模型 A/B 應排在 DB runtime 可用之後，否則會把資料環境問題誤判成模型能力問題。

### RD

- `lastAnswerMeta` 修正後 live rerun 24 題皆有 `answerMode=system_direct`、`domainId=enms`。
- `suppressReportBlocks` 只在 EnMS context pack 判定 `chart_render_allowed=false` 時啟用，不影響 verified direct 圖表。
- `suppressReportBlocks` 已從 persisted-only 補強到 live stream；當次畫面與重整後狀態一致。
- Y-CRM / ERP / EnMS 的主 domain 架構未被改動，這輪是 guardrail 與 observability 收斂。

### SRE

- Y-CRM/ERP DB error path 已補共用 redaction helper，避免 connection string / password 類片段外洩。
- 啟動腳本已補 `.env` / `.env.local` 載入與缺 DB env 警告，並保護 `PORT/HOST/MODE/RUN_STYLE/SKIP_BUILD` 不被 env 檔覆寫造成 pid/log 錯位。
- 新增 `scripts/check-domain-db-env.sh` 作為不洩漏 secrets 的 env presence preflight；預設只回報 ready/missing，`--strict` 可供 CI 或 release gate 擋掉缺 env，但仍需另外做 DB 連線與 schema smoke test。
- 新增 `scripts/check-domain-db-smoke.sh` 作為 read-only DB connection/schema smoke；輸出只顯示 env key 與遮罩後 evidence，不印 connection string 或 customer network detail。
- 目前最大 runtime 風險不是程式，而是部署/本機環境未提供 DB env。

### QA

- 修正後 24 題 live rerun：24 PASS_FAIL_CLOSED / 0 NEEDS_REVIEW / 0 ERROR。
- 這個 PASS_FAIL_CLOSED 僅代表 route/meta/guardrail 與安全降級通過，不代表 DB 內容驗收完成。
- 下一輪 QA 必須在 DB env 可用時重跑同一套 24 題，重新分類 DB 直查、AI 回答、圖表資料與 no-data fallback。

### UI/UX

- 首頁截圖顯示目前模型選擇可見為 GX10-Router。
- 修正後 metadata 已能標示本次是 `system_direct` / `modelClass=none` / `domainId=enms`。
- G01 不再輸出未授權圖表，避免「文字說明 + 空圖」的 UI 誤導。
- 仍需在 DB env 可用後補一次 UI 抽查，確認 `DB 直查 / 本地模型 / 雲端模型 / 系統回答` badge 在真實資料回答下都清楚。

## 建議修正順序

1. 設定本機 / deployment runtime DB env：`YCRM_PG_CONNECTION`、`ERP_PG_CONNECTION`、`ENMS_PG_CONNECTION`，以及 `ENMS_PG_ALLOWED_HOST` / `ENMS_PG_ALLOWED_PORT` / `ENMS_PG_ALLOWED_DATABASE`。
2. 先執行 `bash scripts/check-domain-db-env.sh --domain enms --strict` 完成 EnMS 單線 env presence preflight；三域 smoke 前再執行 `bash scripts/check-domain-db-env.sh --domain all --strict`。
3. 執行 `bash scripts/check-domain-db-smoke.sh --domain enms --strict` 完成 EnMS read-only connection/schema smoke；三域 smoke 前再執行 `--domain all --strict`。
4. 使用同一份 runner 重跑 24 題，確認不再全部 fail-closed，而是能回到 DB-first 查詢路徑。
5. 針對 D03 / E08 / G01 做資料可用情境驗收：site fallback、最新可用 7 天、非圖表題不出圖。
6. 補三域 live smoke：Y-CRM、ERP、EnMS 各一題，確認 DB error redaction 與 domain route。
7. DB env 穩定後，再做 GX10 / gpt-4.1-mini 模型 A/B；避免把 DB 未就緒誤判成模型差異。

## 結論

EnMS 主線的 route、source metadata、chart guardrail、no-data fallback 與 secret redaction 已完成程式與 focused test 收斂，live fail-closed rerun 也通過。下一個 blocker 是 runtime DB env：沒有它，系統會安全停查，這是正確但不可展示的狀態。補齊 env 後要立即重跑 24 題，才能判定 EnMS DB-first 內容回答是否通過驗收。
