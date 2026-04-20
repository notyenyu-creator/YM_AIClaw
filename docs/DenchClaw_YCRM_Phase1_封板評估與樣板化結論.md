# DenchClaw Y-CRM Phase 1 封板評估與樣板化結論

> 更新日期：2026-04-19
> 狀態：phase-1 可封板，適合作為下一個系統的樣板基底
> 範圍：`Y-CRM` domain、`DenchClaw Web`、`OpenClaw Gateway`、`Hermes-style orchestration`、`AI Wiki`

---

## 1. 這份文件的目的

這份文件不是在描述理想藍圖，而是針對目前已落地的 `Y-CRM` 實作，回答三個最實際的問題：

1. 這一階段到底做到了什麼？
2. 現在可不可以封板？
3. 後面接 `ERP / MES / WMS / EMS` 時，哪些部分可以直接複製，哪些部分還要小心？

---

## 2. 封板結論

### 2.1 最短結論

`Y-CRM phase-1 已可封板。`

更完整地說：

- 它已經不是概念驗證
- 也不再只是 debug demo
- 而是一條有主流程、有 review、有 learning loop、有 writeback、有 audit trail 的 domain pilot

這代表它已經可以作為下一個系統接入時的「第一版樣板」。

### 2.2 但這個封板是什麼意思

這裡的「可封板」不是說：

- 所有理想功能都做完了
- 不再需要演進
- 可以直接無修改地複製到所有系統

而是說：

- phase-1 的核心骨架已經完成
- 對後續多系統接入最重要的流程已經成形
- 後面再接新系統時，不用從零開始重新設計

---

## 3. 已完成的核心能力

### 3.1 planner / context 主線

目前已完成：

- `plannerPreflight`
- `ycrm-context-builder`
- `ycrm-context-pack`
- `plannerContextPack` session persistence
- `plannerPreflight` `validationState`
- stale planner artifact invalidation

這代表目前已經不是「聊天前完全沒前置」，而是會先做：

1. intent / route / workspace 判斷
2. 最小 context pack 組裝
3. advisory 狀態顯示
4. session-level 持久化

### 3.2 learning loop 主線

目前已完成：

- `Generate Learning Draft`
- `Write Wiki Draft Files`
- `Promote Wiki Draft Files`
- `Keep Current / Force Promote`
- `minimal evidence` token guardrails

這代表 learning loop 已經是一條真的可操作的流程，而不是文件裡的概念。

### 3.3 review / queue 主線

目前已完成：

- sidebar review queue summary
- `Draft ready / Needs review / Reviewed / Promoted` 狀態
- `Open review`
- `Go to review`
- 正式 review route：`/review/ycrm`
- chat header `Next:` 提示

這代表 review 已經不再是純 debug-first，而是有正式入口的工作流。

### 3.4 writeback / governance / audit 主線

目前已完成：

- conflict detection
- compare view
- reviewer identity
- review reason
- reviewer note
- approval metadata
- session-level timeline / history
- promotion / resolution audit trail
- server-side transition guardrails

這代表目前最關鍵的治理能力已經有基本盤。

---

## 4. 為什麼現在可以封板

### 4.1 因為最重要的骨架已經閉環

目前已經完整形成這條閉環：

1. chat 進來
2. planner preflight
3. context pack
4. session metadata persistence
5. review queue 可見化
6. learning draft
7. wiki writeback
8. promotion / resolution
9. audit trail

這條鏈如果沒有形成，後面接其他系統只會越做越亂。

### 4.2 因為最危險的幾個點已經補過硬化

這一段 phase-1 後半不是一直加新功能，而是在補最容易未來出事的點：

- reviewer 欄位必填
- review reason 必填
- promote / resolve transition 限制
- stale metadata invalidation
- planner metadata 明確標成 `Advisory`
- `different_source_session` conflict coverage
- writeback helper coverage
- queue-level 正式 review 入口

這些補完之後，Y-CRM 才比較適合拿來當樣板。

---

## 5. 現在可以拿去複製的是哪些部分

### 5.1 可以直接複製的骨架

後面接 `ERP / MES / WMS / EMS` 時，這些結構可以直接沿用：

- planner preflight pattern
- context builder / context pack pattern
- session metadata persistence pattern
- review queue pattern
- formal review route pattern
- learning draft / writeback / promotion pattern
- audit trail / reviewer metadata pattern

### 5.2 不能直接照抄的部分

這些不是不能用，而是要依 system domain 重做：

- domain skill 規則
- source-of-truth 定義
- ontology object mapping
- live query rules
- write risk 分級
- review 文案與 compare 策略

也就是說：

`骨架可複製，domain 規則不能偷懶。`

---

## 6. 還沒做，但不阻擋 phase-1 封板的項目

以下這些很重要，但屬於下一階段，不是這一階段不及格：

### 6.1 多系統 router

目前仍是 `Y-CRM first`，還不是完整的跨系統 planner/router。

### 6.2 本地模型堆疊

目前仍是 `AI API Key` 模式，尚未接：

- Ollama
- Qwen 3.5
- Gemma E26B
- turboQuant
- KV Cache

### 6.3 更乾淨的 review / debug 視圖拆分

目前 `/review/ycrm` 已經是正式入口，但底層仍重用既有工作區頁面。後續可再把：

- 正式人工審核
- 維運診斷資訊

做更明確拆分。

### 6.4 自動化 ingest / lint pipeline

現在已經有手動 learning loop，但還沒有正式的自動化知識編譯 pipeline。

---

## 7. 對下一個系統的建議接法

### 7.1 建議順序

建議仍維持：

1. ERP
2. MES
3. WMS
4. EMS

### 7.2 建議接法

不要複製 `Y-CRM` 的內容，而是複製 `Y-CRM` 的方法：

1. 先定 `integration profile`
2. 再定 `ontology / source-of-truth`
3. 再做 domain skill
4. 再做 planner / context pack
5. 最後才接 learning loop / review queue

如果反過來做，很容易只做出一堆 UI 或 prompt，而不是可治理的 domain integration。

---

## 8. 最後結論

如果現在要用一句話定義 `Y-CRM phase-1`：

> 它已經是一個可封板、可驗收、可作為下一個 enterprise system 接入樣板的第一個完整 domain pilot。

如果要再更務實一點：

> 後面接 ERP / MES / WMS / EMS 時，不需要再重新發明整套流程；直接以這一版的 planner、review、learning、writeback、audit 骨架為母版，才是最穩的做法。
