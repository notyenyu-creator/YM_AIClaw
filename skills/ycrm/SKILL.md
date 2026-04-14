---
name: ycrm-database
description: Query and manage Y-CRM (Twenty CRM) data via DuckDB postgres_scanner. Supports read queries across all workspaces and REST API writes.
metadata: { "openclaw": { "inject": true, "always": true, "emoji": "🏢" } }
---

# Y-CRM Database Integration

## ⚠️ MANDATORY: Copy-paste this EXACT exec command pattern for ALL Y-CRM queries

```bash
duckdb -json ':memory:' "INSTALL postgres_scanner; LOAD postgres_scanner; ATTACH 'dbname=default user=postgres password=postgres host=localhost port=5432' AS ycrm (TYPE postgres_scanner, READ_ONLY); SELECT id, \"displayName\" FROM ycrm.core.workspace WHERE \"deletedAt\" IS NULL;"
```

**RULES — DO NOT SKIP ANY STEP:**
1. MUST use `INSTALL postgres_scanner;` — without this, scanner functions don't exist
2. MUST use `LOAD postgres_scanner;` — without this, ATTACH will fail
3. MUST use `ATTACH ... AS ycrm` — this connects to PostgreSQL
4. MUST prefix tables with `ycrm.` — e.g. `ycrm.core.workspace`
5. Do NOT use `discover_schema`, `CALL`, or any function — just use `SELECT`
6. Do NOT query `workspace.duckdb` for Y-CRM data — it does NOT contain Y-CRM data

**When the user mentions 工作區, 客戶, 公司, 成員, 人員, 商機, CRM, or any business data, use the exec command above (change only the SELECT part).**

## Connection — ALWAYS USE THIS EXACT PATTERN

Every Y-CRM query MUST use this exact `exec` command pattern. Replace only the final SELECT:

```bash
duckdb -json ':memory:' "INSTALL postgres_scanner; LOAD postgres_scanner; ATTACH 'dbname=default user=postgres password=postgres host=localhost port=5432' AS ycrm (TYPE postgres_scanner, READ_ONLY); SELECT id, \"displayName\" FROM ycrm.core.workspace WHERE \"deletedAt\" IS NULL ORDER BY \"displayName\";"
```

To run a different query, keep everything before the SELECT identical and only change the SELECT part.

**Safety Rules:** ALWAYS use `READ_ONLY` + `:memory:`. Only SELECT queries. AVOID `passwordHash`, tokens, secrets columns.

## Query Workflow — DISCOVER FIRST, THEN QUERY

**Every workspace may have different tables and custom objects. NEVER assume a table exists — always discover first.**

### Step 1: List all workspaces (copy-paste ready)

```bash
duckdb -json ':memory:' "INSTALL postgres_scanner; LOAD postgres_scanner; ATTACH 'dbname=default user=postgres password=postgres host=localhost port=5432' AS ycrm (TYPE postgres_scanner, READ_ONLY); SELECT id, \"displayName\", subdomain FROM ycrm.core.workspace WHERE \"deletedAt\" IS NULL ORDER BY \"displayName\";"
```

If the user doesn't specify a workspace, ask or use the default `workspace_3joxkr9ofo5hlxjan164egffx` (Y-CRM / youngming).

### Step 2: Discover what tables exist in that workspace

```sql
SELECT table_name FROM ycrm.information_schema.tables
WHERE table_schema = '<WORKSPACE_SCHEMA>'
  AND table_name NOT LIKE '\_%' ESCAPE '\'
ORDER BY table_name;
```

For custom objects (prefixed with `_`):
```sql
SELECT table_name FROM ycrm.information_schema.tables
WHERE table_schema = '<WORKSPACE_SCHEMA>'
  AND table_name LIKE '\_%' ESCAPE '\'
ORDER BY table_name;
```

### Step 3: Discover the columns of the relevant table

```sql
SELECT column_name, data_type FROM ycrm.information_schema.columns
WHERE table_schema = '<WORKSPACE_SCHEMA>' AND table_name = '<TABLE_NAME>'
ORDER BY ordinal_position;
```

### Step 4: Query the data

Now that you know the actual tables and columns, write the query. Always:
- Filter `"deletedAt" IS NULL` (soft delete)
- Quote `"camelCase"` column names
- `LIMIT` results for large tables

### Step 5 (optional): Cross-workspace queries

If the user asks about ALL workspaces or system-level data, use the `core` schema:

```sql
-- All users across all workspaces
SELECT u."firstName", u."lastName", u.email, w."displayName" as workspace_name
FROM ycrm.core."userWorkspace" uw
JOIN ycrm.core."user" u ON uw."userId" = u.id
JOIN ycrm.core.workspace w ON uw."workspaceId" = w.id
WHERE u."deletedAt" IS NULL AND uw."deletedAt" IS NULL
ORDER BY w."displayName", u."lastName";

-- Members of a specific workspace (from workspace schema)
SELECT wm."nameFirstName", wm."nameLastName", wm."userEmail"
FROM ycrm.<WORKSPACE_SCHEMA>."workspaceMember" wm
WHERE wm."deletedAt" IS NULL;

-- Count members per workspace
SELECT w."displayName", count(uw.id) as member_count
FROM ycrm.core.workspace w
LEFT JOIN ycrm.core."userWorkspace" uw ON w.id = uw."workspaceId" AND uw."deletedAt" IS NULL
WHERE w."deletedAt" IS NULL
GROUP BY w."displayName" ORDER BY member_count DESC;
```

## Schema Structure

```
default (database)
├── core                    — System tables (safe to query: workspace, user, userWorkspace)
│   ├── workspace           — All workspaces (id, displayName, subdomain)
│   ├── user                — All users (id, firstName, lastName, email) ⚠️ SKIP passwordHash
│   └── userWorkspace       — User ↔ Workspace mapping (userId, workspaceId)
├── workspace_<base36_id>   — Each workspace has its own schema
│   ├── Standard tables     — person, company, opportunity, task, note, workspaceMember, etc.
│   ├── Custom objects      — Prefixed with _ (e.g., _pet, _yeJiMuBiao) — varies per workspace!
│   └── System tables       — favorite, attachment, message, workflow, etc.
└── public                  — PostgreSQL default
```

**Each workspace can have different custom objects and even different field configurations. Always discover before querying.**

## Workspace Schema Mapping

| Schema | Workspace | Subdomain |
|--------|-----------|-----------|
| `workspace_3joxkr9ofo5hlxjan164egffx` | Y-CRM (主工作區) | youngming |
| `workspace_407lopjyyvm7bxeutk1tvqkpo` | Calleen公司 | calleen-company |
| `workspace_1g99wpzrdddsuiagn4k5gsecx` | HONG MING 越南浤詺資訊 | hong-ming |
| `workspace_5sgeef4h8tfcbqihsmg9numuh` | HOPET | hopet |
| `workspace_1f50bssxzvj2lwap2po8xu7cn` | HUYNH | swift-burgundy-eagle |
| `workspace_39f8dylknizhkvjmva16w79r5` | OOCHAIN | glorious-white-owl |
| `workspace_4k895h39wihc4g84axid1ggzi` | Vivian測試工作區 | bright-lavender-lynx |
| `workspace_ah8oi06oyuo29ry1ikb89iu96` | 德佟電子科技 | detonger |
| `workspace_2c96vz4nsg10zwua9xejof4m` | 鹿氏 | mooser-design |

**Default workspace**: When the user doesn't specify, use `workspace_3joxkr9ofo5hlxjan164egffx` (Y-CRM / youngming).

**This list may be outdated.** Always verify with:
```sql
SELECT id, "displayName", subdomain FROM ycrm.core.workspace WHERE "deletedAt" IS NULL;
```

## Column Naming Conventions

Y-CRM uses **camelCase** column names with **composite type flattening**:

| Pattern | Example |
|---------|---------|
| Simple text | `jobTitle`, `city`, `intro` |
| Name composite | `nameFirstName`, `nameLastName` |
| Email composite | `emailsPrimaryEmail`, `emailsAdditionalEmails` |
| Phone composite | `phonesPrimaryPhoneNumber`, `phonesPrimaryPhoneCountryCode` |
| Link composite | `linkedinLinkPrimaryLinkUrl`, `linkedinLinkPrimaryLinkLabel` |
| Domain composite | `domainNamePrimaryLinkUrl`, `domainNameSecondaryLinks` |
| Foreign key | `companyId`, `renYuanId` |
| System fields | `id`, `createdAt`, `updatedAt`, `deletedAt` |
| Custom objects | Prefixed with `_` (e.g., `_pet`, `_yeJiMuBiao`) |

**When unsure about column names, always discover with `information_schema.columns` first.**

## Common Standard Tables (reference only — not guaranteed per workspace)

| Table | Description |
|-------|-------------|
| `person` | Contacts/People |
| `company` | Companies |
| `opportunity` | Sales deals |
| `task` / `taskTarget` | Tasks and associations |
| `note` / `noteTarget` | Notes and associations |
| `message` / `messageThread` / `messageParticipant` | Email |
| `workspaceMember` | Workspace team members |
| `favorite` / `dashboard` / `attachment` | UI elements |
| `workflow` / `workflowRun` | Automations |
| `connectedAccount` | Email accounts (⚠️ Contains OAuth tokens) |

## Important Notes

1. **Always filter `deletedAt IS NULL`** — Y-CRM uses soft delete
2. **Quote column names** — `"camelCase"` syntax required
3. **UUID primary keys** — all `id` columns are UUID type
4. **JSON columns** — `additionalEmails`, `additionalPhones`, `secondaryLinks` are JSONB arrays
5. **Performance** — queries typically < 200ms, JOINs < 300ms
6. **Dynamic schema** — new workspaces/tables/columns are immediately visible, no cache

---

## REST API for Write Operations

Direct SQL writes are blocked by READ_ONLY. Use REST API for create/update/delete.

**Base URL**: `http://localhost:8867`
**Auth**: `Authorization: Bearer <YCRM_API_TOKEN>`

### Common REST Paths

| DB Table | REST Path |
|----------|-----------|
| `person` | `/rest/people` |
| `company` | `/rest/companies` |
| `opportunity` | `/rest/opportunities` |
| `task` | `/rest/tasks` |
| `note` | `/rest/notes` |
| Custom `_xxx` | `/rest/_xxxs` (check metadata) |

### CRUD Examples

```bash
# Create
curl -X POST http://localhost:8867/rest/people \
  -H "Authorization: Bearer <YCRM_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "name": { "firstName": "小明", "lastName": "王" }, "jobTitle": "工程師" }'
# Response: { "data": { "createPerson": { "id": "...", ... } } }

# Update
curl -X PATCH http://localhost:8867/rest/people/<id> \
  -H "Authorization: Bearer <YCRM_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "jobTitle": "資深工程師" }'

# Delete (soft delete)
curl -X DELETE http://localhost:8867/rest/people/<id> \
  -H "Authorization: Bearer <YCRM_API_TOKEN>"

# Filter
curl "http://localhost:8867/rest/people?filter=name.lastName[eq]:王&limit=10" \
  -H "Authorization: Bearer <YCRM_API_TOKEN>"
# Comparators: eq, neq, in, gt, gte, lt, lte, like, ilike, is, startsWith
```

### Write Workflow

1. **Discover** — use postgres_scanner to find tables/columns in the target workspace
2. **Read first** — check existing data to avoid duplicates
3. **Resolve references** — look up foreign key IDs (e.g., companyId)
4. **Write via REST** — curl with proper auth token
5. **Confirm** — read back the record to verify
