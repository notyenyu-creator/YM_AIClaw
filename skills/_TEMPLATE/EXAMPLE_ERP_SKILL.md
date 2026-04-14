---
name: erp-database
description: Query and manage ERP data (orders, inventory, BOM, vendors) via DuckDB postgres_scanner. Supports read queries and REST API writes.
metadata: { "openclaw": { "always": true, "emoji": "🏭" } }
---

# ERP Database Integration

**IMPORTANT — 區分 DenchClaw 本地資料與 ERP 系統：**
- **DenchClaw CRM** (local workspace DuckDB at `workspace.duckdb`) = DenchClaw 的本地資料庫
- **ERP** (PostgreSQL at `localhost:5433`) = 生產 ERP 系統，真實業務資料

**When the user mentions ERP, 進銷存, 採購, 銷售, 庫存, 物料, BOM, 供應商, 訂單, or asks about production/procurement data, ALWAYS query ERP via postgres_scanner — NOT the local workspace DuckDB.**

Use the `exec` tool to run the DuckDB CLI command.

## Connection

```bash
duckdb -json ':memory:' "
  INSTALL postgres_scanner; LOAD postgres_scanner;
  ATTACH 'dbname=erp_prod user=erp_reader password=readonly123 host=localhost port=5433'
  AS erp (TYPE postgres_scanner, READ_ONLY);
  <YOUR_QUERY_HERE>
"
```

**Safety Rules:** ALWAYS use `READ_ONLY` + `:memory:`. Only SELECT queries. AVOID password, token, secret columns.

## Query Workflow — DISCOVER FIRST, THEN QUERY

**NEVER assume a table or column exists — always discover first.**

### Step 1: Discover all schemas

```sql
SELECT schema_name FROM erp.information_schema.schemata
WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
ORDER BY schema_name;
```

### Step 2: Discover what tables exist

```sql
SELECT table_name FROM erp.information_schema.tables
WHERE table_schema = '<SCHEMA>'
ORDER BY table_name;
```

### Step 3: Discover the columns of a table

```sql
SELECT column_name, data_type, is_nullable
FROM erp.information_schema.columns
WHERE table_schema = '<SCHEMA>' AND table_name = '<TABLE>'
ORDER BY ordinal_position;
```

### Step 4: Query the data

Now that you know the actual tables and columns, write the query. Always:
- `LIMIT` results for large tables
- Use the actual column names discovered in Step 3

### Step 5: Sample data if unsure

```sql
SELECT * FROM erp.<SCHEMA>."<TABLE>" LIMIT 5;
```

## Important Notes

1. **Always discover schema first** — never hardcode table/column assumptions
2. **READ_ONLY mode** — only SELECT queries allowed
3. **Skip sensitive columns** — passwords, tokens, API keys
4. **LIMIT results** — avoid pulling large datasets
5. **ERP systems vary** — ERPNext uses `tabXxx`, Odoo uses `snake_case`, SAP uses `ALL_CAPS`

---

## REST API for Write Operations

**Base URL**: `http://localhost:8080/api`
**Auth**: `Authorization: Bearer $ERP_API_TOKEN`

### Write Workflow

1. **Discover** — use postgres_scanner to find tables/columns
2. **Read first** — check existing data to avoid duplicates
3. **Resolve references** — look up foreign key IDs (e.g., vendor_id, product_id)
4. **Write via REST** — curl with proper auth token
5. **Confirm** — read back the record to verify
