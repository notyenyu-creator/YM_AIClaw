# EnMS Data Trace Playbook

## Goal
建立從 gateway 到 raw table 的 trace / debug 標準流程。

## Query Pattern
1. 先確認 `mqtt_raw_messages`
2. 再看 `mqtt_raw_data`
3. 對照 meter / site / company 語意

## Output Contract
- trace 路徑
- 斷點位置
- 需要人工修復的資料鏈
