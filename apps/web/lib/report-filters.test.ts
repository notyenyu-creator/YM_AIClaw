import { describe, it, expect } from "vitest";
import {
  escapeSqlString,
  buildFilterClauses,
  injectFilters,
  checkSqlSafety,
  type FilterEntry,
} from "./report-filters";

// ─── escapeSqlString ───

describe("escapeSqlString", () => {
  it("returns unchanged string when no quotes", () => {
    expect(escapeSqlString("hello world")).toBe("hello world");
  });

  it("escapes single quotes", () => {
    expect(escapeSqlString("O'Brien")).toBe("O''Brien");
  });

  it("escapes multiple single quotes", () => {
    expect(escapeSqlString("it's a 'test'")).toBe("it''s a ''test''");
  });

  it("handles empty string", () => {
    expect(escapeSqlString("")).toBe("");
  });

  it("does not double-escape already escaped quotes", () => {
    expect(escapeSqlString("don''t")).toBe("don''''t");
  });
});

// ─── buildFilterClauses ───

describe("buildFilterClauses", () => {
  it("returns empty array for undefined filters", () => {
    expect(buildFilterClauses(undefined)).toEqual([]);
  });

  it("returns empty array for empty filters array", () => {
    expect(buildFilterClauses([])).toEqual([]);
  });

  // --- dateRange ---
  it("builds dateRange clause with from only", () => {
    const filters: FilterEntry[] = [
      { id: "d", column: "created_at", value: { type: "dateRange", from: "2025-01-01" } },
    ];
    const clauses = buildFilterClauses(filters);
    expect(clauses).toEqual([`"created_at" >= '2025-01-01'`]);
  });

  it("builds dateRange clause with to only", () => {
    const filters: FilterEntry[] = [
      { id: "d", column: "created_at", value: { type: "dateRange", to: "2025-12-31" } },
    ];
    const clauses = buildFilterClauses(filters);
    expect(clauses).toEqual([`"created_at" <= '2025-12-31'`]);
  });

  it("builds dateRange clause with both from and to", () => {
    const filters: FilterEntry[] = [
      { id: "d", column: "created_at", value: { type: "dateRange", from: "2025-01-01", to: "2025-12-31" } },
    ];
    const clauses = buildFilterClauses(filters);
    expect(clauses).toHaveLength(2);
    expect(clauses[0]).toBe(`"created_at" >= '2025-01-01'`);
    expect(clauses[1]).toBe(`"created_at" <= '2025-12-31'`);
  });

  it("skips dateRange with no from or to", () => {
    const filters: FilterEntry[] = [
      { id: "d", column: "created_at", value: { type: "dateRange" } },
    ];
    expect(buildFilterClauses(filters)).toEqual([]);
  });

  // --- select ---
  it("builds select clause", () => {
    const filters: FilterEntry[] = [
      { id: "s", column: "Status", value: { type: "select", value: "Active" } },
    ];
    expect(buildFilterClauses(filters)).toEqual([`"Status" = 'Active'`]);
  });

  it("skips select with no value", () => {
    const filters: FilterEntry[] = [
      { id: "s", column: "Status", value: { type: "select" } },
    ];
    expect(buildFilterClauses(filters)).toEqual([]);
  });

  it("escapes SQL injection in select value", () => {
    const filters: FilterEntry[] = [
      { id: "s", column: "Status", value: { type: "select", value: "'; DROP TABLE users; --" } },
    ];
    const clauses = buildFilterClauses(filters);
    // The single quote in the injected value is doubled, preventing breakout
    // from the SQL string literal. "DROP TABLE" remains as inert text inside quotes.
    expect(clauses[0]).toBe(`"Status" = '''; DROP TABLE users; --'`);
    // Verify the quote is doubled (key defense)
    expect(clauses[0]).toContain("''");
  });

  it("escapes multiple injection attempts in multiSelect", () => {
    const filters: FilterEntry[] = [
      { id: "m", column: "Stage", value: { type: "multiSelect", values: ["a'b", "c'd"] } },
    ];
    const clauses = buildFilterClauses(filters);
    expect(clauses[0]).toBe(`"Stage" IN ('a''b', 'c''d')`);
  });

  // --- multiSelect ---
  it("builds multiSelect clause with one value", () => {
    const filters: FilterEntry[] = [
      { id: "m", column: "Stage", value: { type: "multiSelect", values: ["New"] } },
    ];
    expect(buildFilterClauses(filters)).toEqual([`"Stage" IN ('New')`]);
  });

  it("builds multiSelect clause with multiple values", () => {
    const filters: FilterEntry[] = [
      { id: "m", column: "Stage", value: { type: "multiSelect", values: ["New", "Active", "Closed"] } },
    ];
    expect(buildFilterClauses(filters)).toEqual([`"Stage" IN ('New', 'Active', 'Closed')`]);
  });

  it("skips multiSelect with empty values", () => {
    const filters: FilterEntry[] = [
      { id: "m", column: "Stage", value: { type: "multiSelect", values: [] } },
    ];
    expect(buildFilterClauses(filters)).toEqual([]);
  });

  it("skips multiSelect with undefined values", () => {
    const filters: FilterEntry[] = [
      { id: "m", column: "Stage", value: { type: "multiSelect" } },
    ];
    expect(buildFilterClauses(filters)).toEqual([]);
  });

  // --- number ---
  it("builds number clause with min only", () => {
    const filters: FilterEntry[] = [
      { id: "n", column: "Amount", value: { type: "number", min: 100 } },
    ];
    expect(buildFilterClauses(filters)).toEqual([`CAST("Amount" AS NUMERIC) >= 100`]);
  });

  it("builds number clause with max only", () => {
    const filters: FilterEntry[] = [
      { id: "n", column: "Amount", value: { type: "number", max: 1000 } },
    ];
    expect(buildFilterClauses(filters)).toEqual([`CAST("Amount" AS NUMERIC) <= 1000`]);
  });

  it("builds number clause with both min and max", () => {
    const filters: FilterEntry[] = [
      { id: "n", column: "Amount", value: { type: "number", min: 100, max: 1000 } },
    ];
    const clauses = buildFilterClauses(filters);
    expect(clauses).toHaveLength(2);
    expect(clauses[0]).toBe(`CAST("Amount" AS NUMERIC) >= 100`);
    expect(clauses[1]).toBe(`CAST("Amount" AS NUMERIC) <= 1000`);
  });

  it("handles min of 0 correctly", () => {
    const filters: FilterEntry[] = [
      { id: "n", column: "Score", value: { type: "number", min: 0 } },
    ];
    // min is 0, which is defined, so should produce a clause
    expect(buildFilterClauses(filters)).toEqual([`CAST("Score" AS NUMERIC) >= 0`]);
  });

  it("skips number with no min or max", () => {
    const filters: FilterEntry[] = [
      { id: "n", column: "Amount", value: { type: "number" } },
    ];
    expect(buildFilterClauses(filters)).toEqual([]);
  });

  // --- column escaping ---
  it("escapes double quotes in column names", () => {
    const filters: FilterEntry[] = [
      { id: "s", column: 'Bad"Column', value: { type: "select", value: "x" } },
    ];
    expect(buildFilterClauses(filters)).toEqual([`"Bad""Column" = 'x'`]);
  });

  // --- multiple filters combined ---
  it("builds clauses for multiple different filter types", () => {
    const filters: FilterEntry[] = [
      { id: "d", column: "created_at", value: { type: "dateRange", from: "2025-01-01" } },
      { id: "s", column: "Status", value: { type: "select", value: "Active" } },
      { id: "n", column: "Amount", value: { type: "number", min: 50 } },
    ];
    const clauses = buildFilterClauses(filters);
    expect(clauses).toHaveLength(3);
    expect(clauses[0]).toContain("created_at");
    expect(clauses[1]).toContain("Status");
    expect(clauses[2]).toContain("Amount");
  });
});

// ─── injectFilters ───

describe("injectFilters", () => {
  it("returns original SQL when no clauses", () => {
    const sql = "SELECT * FROM v_deals";
    expect(injectFilters(sql, [])).toBe(sql);
  });

  it("wraps SQL as CTE with single filter", () => {
    const sql = "SELECT * FROM v_deals";
    const clauses = [`"Status" = 'Active'`];
    const result = injectFilters(sql, clauses);
    expect(result).toBe(
      `WITH __report_data AS (SELECT * FROM v_deals) SELECT * FROM __report_data WHERE "Status" = 'Active'`,
    );
  });

  it("wraps SQL with multiple filters joined by AND", () => {
    const sql = "SELECT * FROM v_deals";
    const clauses = [`"Status" = 'Active'`, `"Amount" >= 100`];
    const result = injectFilters(sql, clauses);
    expect(result).toContain("AND");
    expect(result).toContain(`"Status" = 'Active'`);
    expect(result).toContain(`"Amount" >= 100`);
  });

  it("strips trailing semicolon from original SQL", () => {
    const sql = "SELECT * FROM v_deals;";
    const clauses = [`"Status" = 'Active'`];
    const result = injectFilters(sql, clauses);
    expect(result).toContain("AS (SELECT * FROM v_deals)");
    expect(result).not.toContain("v_deals;)");
  });

  it("handles complex SQL with GROUP BY", () => {
    const sql = `SELECT "Stage", COUNT(*) as cnt FROM v_deals GROUP BY "Stage"`;
    const clauses = [`"Status" = 'Active'`];
    const result = injectFilters(sql, clauses);
    expect(result).toContain("__report_data");
    expect(result).toContain("GROUP BY");
    // The CTE wraps the entire query, so the GROUP BY is inside the CTE
    expect(result).toMatch(/^WITH __report_data AS/);
  });

  it("preserves SQL with existing WITH clause", () => {
    const sql = `WITH base AS (SELECT * FROM v_deals) SELECT * FROM base`;
    const clauses = [`"x" = '1'`];
    const result = injectFilters(sql, clauses);
    // The original CTE gets nested inside __report_data
    expect(result).toContain("__report_data");
    expect(result).toContain("WITH base AS");
  });
});

// ─── checkSqlSafety ───

describe("checkSqlSafety", () => {
  it("allows SELECT queries", () => {
    expect(checkSqlSafety("SELECT * FROM v_deals")).toBeNull();
  });

  it("allows SELECT with leading whitespace", () => {
    expect(checkSqlSafety("  SELECT * FROM v_deals")).toBeNull();
  });

  it("allows WITH (CTE) queries", () => {
    expect(checkSqlSafety("WITH base AS (SELECT 1) SELECT * FROM base")).toBeNull();
  });

  it("rejects DROP statements", () => {
    expect(checkSqlSafety("DROP TABLE users")).not.toBeNull();
  });

  it("rejects DELETE statements", () => {
    expect(checkSqlSafety("DELETE FROM users")).not.toBeNull();
  });

  it("rejects INSERT statements", () => {
    expect(checkSqlSafety("INSERT INTO users VALUES (1)")).not.toBeNull();
  });

  it("rejects UPDATE statements", () => {
    expect(checkSqlSafety("UPDATE users SET name = 'x'")).not.toBeNull();
  });

  it("rejects ALTER statements", () => {
    expect(checkSqlSafety("ALTER TABLE users ADD COLUMN x INT")).not.toBeNull();
  });

  it("rejects CREATE statements", () => {
    expect(checkSqlSafety("CREATE TABLE x (id INT)")).not.toBeNull();
  });

  it("rejects TRUNCATE statements", () => {
    expect(checkSqlSafety("TRUNCATE TABLE users")).not.toBeNull();
  });

  it("is case-insensitive", () => {
    expect(checkSqlSafety("drop table users")).not.toBeNull();
    expect(checkSqlSafety("Drop Table Users")).not.toBeNull();
  });

  it("allows SELECT that contains mutation keywords in column names", () => {
    // The SQL starts with SELECT, so it should be allowed
    expect(checkSqlSafety('SELECT "delete_count", "update_time" FROM v_stats')).toBeNull();
  });

  it("allows SELECT with mutation words inside literals or comments", () => {
    expect(checkSqlSafety("SELECT 'DROP TABLE is only a label' AS note")).toBeNull();
    expect(checkSqlSafety("SELECT 1 -- DROP TABLE users")).toBeNull();
    expect(checkSqlSafety("SELECT 1 /* DELETE FROM users */")).toBeNull();
  });

  it("rejects connection, extension, and privilege statements", () => {
    expect(checkSqlSafety("ATTACH 'host=x password=secret' AS enms")).not.toBeNull();
    expect(checkSqlSafety("INSTALL postgres_scanner")).not.toBeNull();
    expect(checkSqlSafety("LOAD postgres_scanner")).not.toBeNull();
    expect(checkSqlSafety("GRANT ALL ON users TO admin")).not.toBeNull();
    expect(checkSqlSafety("SELECT * FROM x; ATTACH 'host=x password=secret' AS enms")).not.toBeNull();
  });

  it("rejects multi-statement mutation attempts", () => {
    expect(checkSqlSafety("SELECT 1; DROP TABLE users")).not.toBeNull();
    expect(checkSqlSafety("WITH base AS (SELECT 1) SELECT * FROM base; UPDATE users SET name = 'x'")).not.toBeNull();
    expect(checkSqlSafety("SELECT * FROM users; DELETE FROM users")).not.toBeNull();
  });

  it("rejects empty SQL", () => {
    expect(checkSqlSafety("")).not.toBeNull();
  });

  it("allows EXPLAIN SELECT (not in forbidden list)", () => {
    expect(checkSqlSafety("EXPLAIN SELECT * FROM users")).toBeNull();
  });

  it("rejects non-report read or operational statements", () => {
    expect(checkSqlSafety("PRAGMA show_tables")).not.toBeNull();
    expect(checkSqlSafety("SET threads=4")).not.toBeNull();
    expect(checkSqlSafety("CALL system_function()")).not.toBeNull();
    expect(checkSqlSafety("VACUUM")).not.toBeNull();
    expect(checkSqlSafety("MERGE INTO users USING updates ON users.id = updates.id WHEN MATCHED THEN UPDATE SET name = updates.name")).not.toBeNull();
    expect(checkSqlSafety("EXPLAIN VACUUM")).not.toBeNull();
  });
});

// ─── Edge cases for buildFilterClauses ───

describe("buildFilterClauses (edge cases)", () => {
  it("handles unicode in select filter values", () => {
    const filters: FilterEntry[] = [
      { id: "s", column: "Name", value: { type: "select", value: "日本語" } },
    ];
    const clauses = buildFilterClauses(filters);
    expect(clauses[0]).toBe(`"Name" = '日本語'`);
  });

  it("handles very long column names", () => {
    const longName = "a".repeat(200);
    const filters: FilterEntry[] = [
      { id: "s", column: longName, value: { type: "select", value: "x" } },
    ];
    const clauses = buildFilterClauses(filters);
    expect(clauses[0]).toContain(longName);
  });

  it("handles NaN min in number filter", () => {
    const filters: FilterEntry[] = [
      { id: "n", column: "Amount", value: { type: "number", min: NaN } },
    ];
    const clauses = buildFilterClauses(filters);
    // NaN is !== undefined so it should produce a clause
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toContain("NaN");
  });

  it("handles max of 0 in number filter", () => {
    const filters: FilterEntry[] = [
      { id: "n", column: "Score", value: { type: "number", max: 0 } },
    ];
    expect(buildFilterClauses(filters)).toEqual([`CAST("Score" AS NUMERIC) <= 0`]);
  });

  it("handles multiSelect with single-quote values", () => {
    const filters: FilterEntry[] = [
      { id: "m", column: "Tag", value: { type: "multiSelect", values: ["it's", "they're"] } },
    ];
    const clauses = buildFilterClauses(filters);
    expect(clauses[0]).toBe(`"Tag" IN ('it''s', 'they''re')`);
  });
});

// ─── Edge cases for injectFilters ───

describe("injectFilters (edge cases)", () => {
  it("handles SQL with multiple semicolons", () => {
    const sql = "SELECT * FROM t;;";
    const clauses = [`"x" = '1'`];
    const result = injectFilters(sql, clauses);
    expect(result).toContain("__report_data");
    expect(result).not.toContain("t;;");
  });

  it("handles SQL with nested CTE", () => {
    const sql = "WITH a AS (WITH b AS (SELECT 1) SELECT * FROM b) SELECT * FROM a";
    const clauses = [`"x" = '1'`];
    const result = injectFilters(sql, clauses);
    expect(result).toContain("__report_data");
    expect(result).toContain("WITH a AS");
  });
});

describe("checkSqlSafety (DuckDB file readers)", () => {
  it.each([
    "SELECT getenv('ENMS_PG_CONNECTION') AS leaked",
    "SELECT * FROM postgres_scan('host=localhost password=secret', 'public', 'users')",
    "SELECT * FROM postgres_query('host=localhost password=secret', 'SELECT 1')",
    "SELECT * FROM postgres_execute('host=localhost password=secret', 'SELECT 1')",
    "SELECT * FROM postgres_attach('host=localhost password=secret')",
    "SELECT * FROM json_execute_serialized_sql(json_serialize_sql('SELECT 1'))",
    "SELECT json_serialize_sql('SELECT * FROM read_text(''/etc/hosts'')')",
    "SELECT * FROM json_deserialize_sql('{\"statements\":[]}')",
    "SELECT * FROM read_csv_auto('/etc/passwd')",
    "SELECT * FROM read_json_auto('/tmp/data.json')",
    "SELECT * FROM read_json_objects('/tmp/data.json')",
    "SELECT * FROM read_json_objects_auto('/tmp/data.json')",
    "SELECT * FROM read_ndjson_auto('/tmp/data.ndjson')",
    "SELECT * FROM read_ndjson_objects('/tmp/data.ndjson')",
    "SELECT * FROM read_parquet('/tmp/data.parquet')",
    "SELECT * FROM read_duckdb('/tmp/data.duckdb')",
    "SELECT * FROM sniff_csv('/tmp/data.csv')",
    "SELECT * FROM parquet_scan('/tmp/data.parquet')",
    "SELECT * FROM glob('/Users/*')",
  ])("rejects file-reading function: %s", (sql) => {
    expect(checkSqlSafety(sql)).toContain("file-reading or dynamic SQL functions are not allowed");
  });

  it.each([
    "SELECT * FROM '/Users/ym/DenchClaw/package.json'",
    "SELECT * FROM '/tmp/local.csv'",
    "SELECT t.* FROM safe_table s JOIN '/tmp/local.json' t ON true",
    "SELECT * FROM (VALUES (1)) v, '/tmp/local.json' p LIMIT 1",
    "WITH x AS (SELECT * FROM '/tmp/local.json') SELECT * FROM x",
    "SELECT * FROM (SELECT * FROM '/tmp/local.json') nested",
  ])("rejects DuckDB replacement file scan: %s", (sql) => {
    expect(checkSqlSafety(sql)).toContain("file path scans are not allowed");
  });

  it("does not treat SELECT-list string literals as replacement file scans", () => {
    expect(checkSqlSafety("SELECT 'a' AS one, '/tmp/not-a-table.json' AS two")).toBeNull();
    expect(checkSqlSafety("SELECT * FROM safe_table WHERE label IN ('a', '/tmp/not-a-table.json')")).toBeNull();
  });

  it.each([
    "SELECT * FROM query('SELECT * FROM read_text(''/etc/passwd'')')",
    "SELECT * FROM query_table('internal_table')",
  ])("rejects DuckDB dynamic SQL wrapper: %s", (sql) => {
    expect(checkSqlSafety(sql)).toContain("file-reading or dynamic SQL functions are not allowed");
  });

  it.each([
    'SELECT * FROM "read_text"(\'/etc/hosts\')',
    'SELECT * FROM "glob"(\'/etc/host*\')',
    'SELECT * FROM "query"(\'SELECT * FROM read_text(\'\'/etc/hosts\'\') LIMIT 1\')',
    'SELECT "getenv"(\'ENMS_PG_CONNECTION\') AS leaked',
  ])("rejects quoted DuckDB dangerous functions: %s", (sql) => {
    expect(checkSqlSafety(sql)).toContain("file-reading or dynamic SQL functions are not allowed");
  });

  it("ignores file-reading function names inside string literals", () => {
    expect(checkSqlSafety("SELECT 'read_csv_auto(' AS label")).toBeNull();
    expect(checkSqlSafety("SELECT 'query(' AS label")).toBeNull();
    expect(checkSqlSafety("SELECT 'getenv(' AS label")).toBeNull();
  });

  it("does not let quotes inside comments hide dangerous SQL", () => {
    expect(checkSqlSafety("-- '\nSELECT getenv('ENMS_PG_CONNECTION')")).toContain(
      "file-reading or dynamic SQL functions are not allowed",
    );
    expect(checkSqlSafety("SELECT 1 /* ' */; DROP TABLE users")).toContain(
      "Only one SELECT query is allowed in reports",
    );
  });

  it("does not treat comment markers inside string literals as real comments", () => {
    expect(checkSqlSafety("SELECT '-- not a comment: DROP TABLE users' AS label")).toBeNull();
    expect(checkSqlSafety("SELECT '/* not a comment */ getenv(' AS label")).toBeNull();
  });
});
