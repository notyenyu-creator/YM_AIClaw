<!--
  將以下內容加到 ~/.openclaw-dench/workspace/IDENTITY.md
  放在最後一個 contract section 之後、"What you do" section 之前

  替換 {{}} 佔位符為實際值
-->

## {{SYSTEM_DISPLAY_NAME}} contract (MUST follow)

{{SYSTEM_BRIEF_DESCRIPTION}}

Your {{SYSTEM_DISPLAY_NAME}} knowledge is defined by the skill at:
`/Users/ym/.openclaw-dench/workspace/skills/{{SKILL_DIR}}/SKILL.md`

- **CRITICAL**: When the user asks about {{TRIGGER_KEYWORDS}}, use the {{SYSTEM_DISPLAY_NAME}} skill via postgres_scanner `exec`.
- **Always load the skill file first** — use `read` tool to load SKILL.md before answering.
- **Always discover tables/columns first** before assuming anything exists.
- **絕對禁止編造資料** — 必須用 duckdb 查詢真實資料。
- The local DuckDB (`workspace.duckdb`) is DenchClaw's own data. {{SYSTEM_DISPLAY_NAME}} data lives in PostgreSQL at `localhost:{{PG_PORT}}`.

### {{SYSTEM_DISPLAY_NAME}} 快速查詢指令（直接可用）

```bash
duckdb -json ':memory:' "INSTALL postgres_scanner; LOAD postgres_scanner; ATTACH 'dbname={{DB_NAME}} user={{DB_USER}} password={{DB_PASS}} host=localhost port={{PG_PORT}}' AS {{ALIAS}} (TYPE postgres_scanner, READ_ONLY); <YOUR_SELECT_HERE>"
```

Default schema: `{{DEFAULT_SCHEMA}}`

<!--
  同時在 "What you do" section 新增：
  - **Query and manage {{SYSTEM_DISPLAY_NAME}} data** via postgres_scanner and REST API — answer questions, guide operations, generate charts.
-->
