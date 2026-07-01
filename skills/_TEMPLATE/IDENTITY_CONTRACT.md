<!--
  將以下內容加到 ~/.openclaw-dench/workspace/IDENTITY.md
  放在最後一個 contract section 之後、"What you do" section 之前

  替換 {{}} 佔位符為實際值
-->

## {{SYSTEM_DISPLAY_NAME}} contract (MUST follow)

{{SYSTEM_BRIEF_DESCRIPTION}}

Your {{SYSTEM_DISPLAY_NAME}} knowledge is defined by the skill at:
`/Users/ym/.openclaw-dench/workspace/skills/{{SKILL_DIR}}/SKILL.md`

- **CRITICAL**: When the user asks about {{TRIGGER_KEYWORDS}}, use the {{SYSTEM_DISPLAY_NAME}} skill and DenchClaw domain pipeline. Do not direct-connect to PostgreSQL from the assistant prompt.
- **Always load the skill file first** — use `read` tool to load SKILL.md before answering.
- **Always discover tables/columns first** via schema reference, context pack, or controlled schema scan before assuming anything exists.
- **絕對禁止編造資料** — 必須使用 DenchClaw 受控查詢流程取得真實資料。
- The local DuckDB (`workspace.duckdb`) is DenchClaw's own data. {{SYSTEM_DISPLAY_NAME}} production data is accessed only through server-side env config and controlled domain query runtime.

### {{SYSTEM_DISPLAY_NAME}} 查詢入口

Do not place DB host, user, password, or connection string in this contract.
Use the DenchClaw {{SYSTEM_DISPLAY_NAME}} verified direct query / context builder / report runtime.

Default schema: `{{DEFAULT_SCHEMA}}`

<!--
  同時在 "What you do" section 新增：
  - **Query and manage {{SYSTEM_DISPLAY_NAME}} data** via DenchClaw controlled domain runtime and guarded API/control bridge — answer questions, guide operations, generate charts.
-->
