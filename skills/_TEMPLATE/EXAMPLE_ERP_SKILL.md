---
name: erp-database
description: Query and manage ERP data (orders, inventory, BOM, vendors) through DenchClaw controlled domain runtime. Supports read queries, guarded reports, and controlled API operations.
metadata: { "openclaw": { "always": true, "emoji": "🏭" } }
---

# ERP Database Integration

**IMPORTANT — 區分 DenchClaw 本地資料與 ERP 系統：**
- **DenchClaw CRM** (local workspace DuckDB at `workspace.duckdb`) = DenchClaw 的本地資料庫
- **ERP** = 生產 ERP 系統，真實業務資料，連線資訊只放在 server-side env config

**When the user mentions ERP, 進銷存, 採購, 銷售, 庫存, 物料, BOM, 供應商, 訂單, or asks about production/procurement data, ALWAYS use the ERP domain pipeline — NOT the local workspace DuckDB and NOT a raw PostgreSQL connection from the assistant prompt.**

Use DenchClaw's ERP verified direct query / context builder / report runtime. If a query template does not exist yet, say that the ERP domain needs a new controlled query template rather than inventing data.

## Connection Boundary

Do not put DB host, user, password, or connection string in the skill.
ERP DB access is configured by the backend through `ERP_PG_CONNECTION` or an equivalent server-side runtime setting.

**Safety Rules:** read-only query path only, no sensitive columns, no client-provided connection string, and no report generated from unverified rows.

## Query Workflow — DISCOVER FIRST, THEN QUERY

**NEVER assume a table or column exists — always discover first.**

### Step 1: Discover all schemas

```sql
SELECT schema_name FROM information_schema.schemata
WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
ORDER BY schema_name;
```

### Step 2: Discover what tables exist

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = '<SCHEMA>'
ORDER BY table_name;
```

### Step 3: Discover the columns of a table

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = '<SCHEMA>' AND table_name = '<TABLE>'
ORDER BY ordinal_position;
```

### Step 4: Query the data

Now that you know the actual tables and columns, write the query. Always:
- `LIMIT` results for large tables
- Use the actual column names discovered in Step 3

### Step 5: Sample data if unsure

```sql
SELECT * FROM <SCHEMA>."<TABLE>" LIMIT 5;
```

## Important Notes

1. **Always discover schema first** — never hardcode table/column assumptions
2. **READ_ONLY mode** — only SELECT queries allowed
3. **Skip sensitive columns** — passwords, tokens, API keys
4. **LIMIT results** — avoid pulling large datasets
5. **ERP systems vary** — ERPNext uses `tabXxx`, Odoo uses `snake_case`, SAP uses `ALL_CAPS`

---

## REST API for Write Operations

**Base URL**: controlled by backend runtime config.
**Auth**: `Authorization: Bearer $ERP_API_TOKEN`

### Write Workflow

1. **Discover** — use schema reference, context pack, or controlled schema scan to find tables/columns
2. **Read first** — check existing data to avoid duplicates
3. **Resolve references** — look up foreign key IDs (e.g., vendor_id, product_id)
4. **Write via REST** — curl with proper auth token
5. **Confirm** — read back the record to verify
