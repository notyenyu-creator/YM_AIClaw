import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const TEST_ENMS_CONNECTION =
  "host=118.168.188.27 port=55433 dbname=EnMS user=test password=secret sslmode=disable";
const TEST_YCRM_CONNECTION =
  "dbname=default user=test password=secret host=localhost port=5432";
const TEST_ERP_CONNECTION =
  "host=118.168.188.27 port=5433 dbname=ErpUAT_local user=test password=secret sslmode=disable";
const ORIGINAL_ENV = { ...process.env };

// Mock workspace (include ALL exports used by the routes)
vi.mock("@/lib/workspace", () => ({
  safeResolvePath: vi.fn(() => null),
  resolveWorkspaceRoot: vi.fn(() => null),
  resolveDuckdbBin: vi.fn(() => null),
  duckdbPath: vi.fn(() => null),
  duckdbQuery: vi.fn(() => []),
  duckdbQueryAsync: vi.fn(async () => []),
  duckdbQueryAsyncDetailed: vi.fn(async () => ({ rows: [], error: null })),
  duckdbQueryExternalPgAsync: vi.fn(async () => []),
  duckdbQueryExternalPgAsyncDetailed: vi.fn(async () => ({ rows: [], error: null })),
  duckdbQueryOnFile: vi.fn(() => []),
  duckdbQueryOnFileAsync: vi.fn(async () => []),
  duckdbExecOnFile: vi.fn(() => true),
  discoverDuckDBPaths: vi.fn(() => []),
  isDatabaseFile: vi.fn(() => false),
}));

// Mock report-filters
vi.mock("@/lib/report-filters", () => ({
  buildFilterClauses: vi.fn(() => []),
  injectFilters: vi.fn((sql: string) => sql),
  checkSqlSafety: vi.fn(() => null),
  maskSqlLiteralsAndComments: vi.fn((sql: string) =>
    sql
      .replace(/'(?:''|[^'])*'/g, "''")
      .replace(/"(?:""|[^"])*"/g, '""')
      .replace(/--[^\n\r]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, ""),
  ),
}));

describe("Workspace DB & Reports API", () => {
  beforeEach(() => {
    process.env.ENMS_PG_CONNECTION = TEST_ENMS_CONNECTION;
    process.env.YCRM_PG_CONNECTION = TEST_YCRM_CONNECTION;
    process.env.ERP_PG_CONNECTION = TEST_ERP_CONNECTION;
    delete process.env.OPENCLAW_ENMS_PG_CONNECTION;
    delete process.env.ENMS_POSTGRES_CONNECTION;
    delete process.env.OPENCLAW_YCRM_PG_CONNECTION;
    delete process.env.YCRM_POSTGRES_CONNECTION;
    delete process.env.OPENCLAW_ERP_PG_CONNECTION;
    delete process.env.ERP_POSTGRES_CONNECTION;
    vi.resetModules();
    vi.mock("@/lib/workspace", () => ({
      safeResolvePath: vi.fn(() => null),
      resolveWorkspaceRoot: vi.fn(() => null),
      resolveDuckdbBin: vi.fn(() => null),
      duckdbPath: vi.fn(() => null),
      duckdbQuery: vi.fn(() => []),
      duckdbQueryAsync: vi.fn(async () => []),
      duckdbQueryAsyncDetailed: vi.fn(async () => ({ rows: [], error: null })),
      duckdbQueryExternalPgAsync: vi.fn(async () => []),
      duckdbQueryExternalPgAsyncDetailed: vi.fn(async () => ({ rows: [], error: null })),
      duckdbQueryOnFile: vi.fn(() => []),
      duckdbQueryOnFileAsync: vi.fn(async () => []),
      duckdbExecOnFile: vi.fn(() => true),
      discoverDuckDBPaths: vi.fn(() => []),
      isDatabaseFile: vi.fn(() => false),
    }));
    vi.mock("@/lib/report-filters", () => ({
      buildFilterClauses: vi.fn(() => []),
      injectFilters: vi.fn((sql: string) => sql),
      checkSqlSafety: vi.fn(() => null),
      maskSqlLiteralsAndComments: vi.fn((sql: string) =>
        sql
          .replace(/'(?:''|[^'])*'/g, "''")
          .replace(/"(?:""|[^"])*"/g, '""')
          .replace(/--[^\n\r]*/g, "")
          .replace(/\/\*[\s\S]*?\*\//g, ""),
      ),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  // ─── POST /api/workspace/db/query ───────────────────────────────

  describe("POST /api/workspace/db/query", () => {
    it("returns 400 for missing sql", async () => {
      const { POST } = await import("./db/query/route.js");
      const req = new Request("http://localhost/api/workspace/db/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "test.duckdb" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing path", async () => {
      const { POST } = await import("./db/query/route.js");
      const req = new Request("http://localhost/api/workspace/db/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: "SELECT 1" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("rejects mutation queries with 403", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue("Only SELECT queries are allowed in reports");
      const { safeResolvePath } = await import("@/lib/workspace");
      vi.mocked(safeResolvePath).mockReturnValue("/ws/test.duckdb");

      const { POST } = await import("./db/query/route.js");
      const req = new Request("http://localhost/api/workspace/db/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "test.duckdb", sql: "DROP TABLE users" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("uses shared SQL safety for DuckDB file queries", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(
        "Only approved report queries are allowed; file-reading or dynamic SQL functions are not allowed",
      );
      const { safeResolvePath, duckdbQueryOnFileAsync } = await import("@/lib/workspace");
      vi.mocked(safeResolvePath).mockReturnValue("/ws/test.duckdb");
      vi.mocked(duckdbQueryOnFileAsync).mockClear();

      const { POST } = await import("./db/query/route.js");
      const req = new Request("http://localhost/api/workspace/db/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "test.duckdb",
          sql: 'SELECT * FROM "read_text"(\'/etc/hosts\')',
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
      expect(checkSqlSafety).toHaveBeenCalledWith('SELECT * FROM "read_text"(\'/etc/hosts\')');
      expect(duckdbQueryOnFileAsync).not.toHaveBeenCalled();
    });

    it("executes query and returns rows", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);
      const { safeResolvePath, duckdbQueryOnFileAsync } = await import("@/lib/workspace");
      vi.mocked(safeResolvePath).mockReturnValue("/ws/test.duckdb");
      vi.mocked(duckdbQueryOnFileAsync).mockResolvedValue([{ id: 1, name: "test" }]);

      const { POST } = await import("./db/query/route.js");
      const req = new Request("http://localhost/api/workspace/db/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "test.duckdb", sql: "SELECT * FROM t" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.rows).toEqual([{ id: 1, name: "test" }]);
    });

    it("returns empty rows for empty result", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);
      const { safeResolvePath, duckdbQueryOnFileAsync } = await import("@/lib/workspace");
      vi.mocked(safeResolvePath).mockReturnValue("/ws/test.duckdb");
      vi.mocked(duckdbQueryOnFileAsync).mockResolvedValue([]);

      const { POST } = await import("./db/query/route.js");
      const req = new Request("http://localhost/api/workspace/db/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "test.duckdb", sql: "SELECT * FROM empty" }),
      });
      const res = await POST(req);
      const json = await res.json();
      expect(json.rows).toEqual([]);
    });
  });

  // ─── GET /api/workspace/db/introspect ───────────────────────────

  describe("GET /api/workspace/db/introspect", () => {
    it("returns 400 for missing path", async () => {
      const { GET } = await import("./db/introspect/route.js");
      const req = new Request("http://localhost/api/workspace/db/introspect");
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it("returns 404 when file not found", async () => {
      const { safeResolvePath } = await import("@/lib/workspace");
      vi.mocked(safeResolvePath).mockReturnValue(null);

      const { GET } = await import("./db/introspect/route.js");
      const req = new Request("http://localhost/api/workspace/db/introspect?path=missing.duckdb");
      const res = await GET(req);
      expect(res.status).toBe(404);
    });

    it("returns schema when database exists", async () => {
      const { safeResolvePath, resolveDuckdbBin, duckdbQueryOnFile } = await import("@/lib/workspace");
      vi.mocked(safeResolvePath).mockReturnValue("/ws/test.duckdb");
      vi.mocked(resolveDuckdbBin).mockReturnValue("/opt/homebrew/bin/duckdb");
      vi.mocked(duckdbQueryOnFile).mockReturnValue([
        { table_name: "users", column_name: "id", data_type: "INTEGER", is_nullable: "NO" },
      ]);

      const { GET } = await import("./db/introspect/route.js");
      const req = new Request("http://localhost/api/workspace/db/introspect?path=test.duckdb");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.tables).toBeDefined();
    });
  });

  // ─── POST /api/workspace/reports/execute ────────────────────────

  describe("POST /api/workspace/reports/execute", () => {
    it("returns 400 for missing sql", async () => {
      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("rejects mutation SQL with 403", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue("Only SELECT queries allowed");

      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: "DROP TABLE users" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("executes report query successfully", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);
      const { duckdbQueryAsyncDetailed } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryAsyncDetailed).mockResolvedValue({ rows: [{ count: 42 }], error: null });

      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: "SELECT COUNT(*) as count FROM v_deals" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.rows).toEqual([{ count: 42 }]);
      expect(json.sourceDomain).toBeNull();
      expect(json.sourceKind).toBe("workspace_duckdb");
    });

    it("blocks Y-CRM-qualified report SQL from using ad-hoc external PostgreSQL execution", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);
      const { duckdbQueryAsyncDetailed, duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryAsyncDetailed).mockClear();
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockClear();

      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: "SELECT * FROM ycrm.workspace_3joxkr9ofo5hlxjan164egffx.opportunity",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("引用外部資料域");
      expect(json.error).toContain("Y-CRM");
      expect(json.error).toContain("verified direct query");
      expect(json.sourceDomain).toBe("ycrm");
      expect(json.sourceKind).toBe("blocked_external_postgres");
      expect(duckdbQueryExternalPgAsyncDetailed).not.toHaveBeenCalled();
      expect(duckdbQueryAsyncDetailed).not.toHaveBeenCalled();
    });

    it("blocks Y-CRM-qualified report SQL before reading DB env config", async () => {
      delete process.env.YCRM_PG_CONNECTION;
      delete process.env.Y_CRM_PG_CONNECTION;
      delete process.env.OPENCLAW_YCRM_PG_CONNECTION;
      delete process.env.YCRM_POSTGRES_CONNECTION;
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);

      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: "SELECT * FROM ycrm.workspace_3joxkr9ofo5hlxjan164egffx.opportunity",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("引用外部資料域");
      expect(json.error).toContain("Y-CRM");
      expect(json.error).not.toContain("YCRM_PG_CONNECTION");
      expect(json.error).not.toContain("password=");
    });

    it("blocks quoted ERP-qualified report SQL from using ad-hoc external PostgreSQL execution", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);
      const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryAsyncDetailed } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockClear();
      vi.mocked(duckdbQueryAsyncDetailed).mockClear();

      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: 'SELECT customer_name, COUNT(*) AS cnt FROM "erp".public."SO" GROUP BY customer_name',
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("引用外部資料域");
      expect(json.error).toContain("ERP");
      expect(json.sourceDomain).toBe("erp");
      expect(json.sourceKind).toBe("blocked_external_postgres");
      expect(duckdbQueryExternalPgAsyncDetailed).not.toHaveBeenCalled();
      expect(duckdbQueryAsyncDetailed).not.toHaveBeenCalled();
    });

    it("blocks ERP-qualified report SQL from using ad-hoc external PostgreSQL execution", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);
      const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryAsyncDetailed } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockClear();
      vi.mocked(duckdbQueryAsyncDetailed).mockClear();

      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: 'SELECT customer_name, COUNT(*) AS cnt FROM erp.public."SO" GROUP BY customer_name',
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("引用外部資料域");
      expect(json.error).toContain("ERP");
      expect(json.error).toContain("verified direct query");
      expect(json.error).not.toContain("password=");
      expect(json.sourceDomain).toBe("erp");
      expect(json.sourceKind).toBe("blocked_external_postgres");
      expect(duckdbQueryExternalPgAsyncDetailed).not.toHaveBeenCalled();
      expect(duckdbQueryAsyncDetailed).not.toHaveBeenCalled();
    });

    it("blocks EnMS-qualified report SQL from using ad-hoc external PostgreSQL execution", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);
      const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryAsyncDetailed } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockClear();
      vi.mocked(duckdbQueryAsyncDetailed).mockClear();

      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: 'SELECT "RecordTime", "MaxDemand" FROM enms.public."DeviceDataSummaryView" LIMIT 1',
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("引用外部資料域");
      expect(json.error).toContain("EnMS");
      expect(json.error).toContain("verified direct query");
      expect(json.sourceDomain).toBe("enms");
      expect(json.sourceKind).toBe("blocked_external_postgres");
      expect(duckdbQueryExternalPgAsyncDetailed).not.toHaveBeenCalled();
      expect(duckdbQueryAsyncDetailed).not.toHaveBeenCalled();
    });

    it("blocks cross-domain report SQL with a user-facing explanation", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);
      const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryAsyncDetailed } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockClear();
      vi.mocked(duckdbQueryAsyncDetailed).mockClear();

      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql:
            'SELECT * FROM ycrm.workspace_3joxkr9ofo5hlxjan164egffx.opportunity o JOIN enms.public."DeviceDataSummaryView" v ON 1 = 1',
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("引用外部資料域");
      expect(json.error).toContain("Y-CRM");
      expect(json.error).toContain("EnMS");
      expect(json.sourceDomain).toBeNull();
      expect(json.sourceKind).toBe("blocked_external_postgres");
      expect(duckdbQueryExternalPgAsyncDetailed).not.toHaveBeenCalled();
      expect(duckdbQueryAsyncDetailed).not.toHaveBeenCalled();
    });

    it("does not route domain names inside SQL literals or comments", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);
      const { duckdbQueryExternalPgAsyncDetailed, duckdbQueryAsyncDetailed } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockClear();
      vi.mocked(duckdbQueryAsyncDetailed).mockResolvedValue({
        rows: [{ label: "ycrm.public.opportunity", note: "enms.public.sites" }],
        error: null,
      });

      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql:
            "SELECT 'ycrm.public.opportunity' AS label, 'enms.public.sites' AS note -- erp.public.SO",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.sourceDomain).toBeNull();
      expect(json.sourceKind).toBe("workspace_duckdb");
      expect(duckdbQueryAsyncDetailed).toHaveBeenCalled();
      expect(duckdbQueryExternalPgAsyncDetailed).not.toHaveBeenCalled();
    });

    it("surfaces query errors instead of silently returning empty rows", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);
      const { duckdbQueryAsyncDetailed } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryAsyncDetailed).mockResolvedValue({
        rows: [],
        error: 'Catalog Error: Table with name "salesQuote" does not exist',
      });

      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: "SELECT * FROM salesQuote",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toContain("salesQuote");
    });

    it("applies filters to SQL", async () => {
      const { checkSqlSafety, buildFilterClauses, injectFilters } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);
      vi.mocked(buildFilterClauses).mockReturnValue(['"Status" = \'Active\'']);
      vi.mocked(injectFilters).mockReturnValue("SELECT * FROM filtered");
      const { duckdbQueryAsyncDetailed } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryAsyncDetailed).mockResolvedValue({
        rows: [{ count: 10 }],
        error: null,
      });

      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: "SELECT * FROM v_deals",
          filters: [{ id: "s", column: "Status", value: { type: "select", value: "Active" } }],
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(buildFilterClauses).toHaveBeenCalled();
      expect(injectFilters).toHaveBeenCalled();
    });
  });

  // ─── POST /api/workspace/db/external-pg-query ──────────────────

  describe("POST /api/workspace/db/external-pg-query", () => {
    it("rejects all requests because the legacy endpoint is deprecated", async () => {
      const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockClear();
      const { POST } = await import("./db/external-pg-query/route.js");
      const req = new Request("http://localhost/api/workspace/db/external-pg-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString: "host=localhost password=secret",
          domain: "ycrm",
          sql: "SELECT 1",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(410);
      const json = await res.json();
      expect(json.error).toContain("Deprecated internal route");
      expect(json.error).not.toContain("password=secret");
      expect(duckdbQueryExternalPgAsyncDetailed).not.toHaveBeenCalled();
    });
  });

  // ─── POST /api/workspace/query ─────────────────────────────────

  describe("POST /api/workspace/query", () => {
    it("returns 400 for missing sql", async () => {
      const { POST } = await import("./query/route.js");
      const req = new Request("http://localhost/api/workspace/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("executes query and returns rows", async () => {
      const { duckdbQueryAsync } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryAsync).mockResolvedValue([{ id: 1 }]);

      const { POST } = await import("./query/route.js");
      const req = new Request("http://localhost/api/workspace/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: "SELECT 1 as id" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.rows).toEqual([{ id: 1 }]);
    });

    it("rejects mutation SQL with 403", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue("Only SELECT queries are allowed in reports");
      const { POST } = await import("./query/route.js");
      const req = new Request("http://localhost/api/workspace/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: "DELETE FROM users" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("uses shared SQL safety for generic workspace queries", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(
        "Only approved report queries are allowed; file-reading or dynamic SQL functions are not allowed",
      );
      const { duckdbQueryAsync } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryAsync).mockClear();

      const { POST } = await import("./query/route.js");
      const req = new Request("http://localhost/api/workspace/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: "SELECT getenv('ENMS_PG_CONNECTION')" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
      expect(checkSqlSafety).toHaveBeenCalledWith("SELECT getenv('ENMS_PG_CONNECTION')");
      expect(duckdbQueryAsync).not.toHaveBeenCalled();
    });
  });

  // ─── POST /api/workspace/execute ───────────────────────────────

  describe("POST /api/workspace/execute", () => {
    it("uses shared SQL safety for generic execution", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(
        "Only approved report queries are allowed; file-reading or dynamic SQL functions are not allowed",
      );
      const { duckdbQueryAsync } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryAsync).mockClear();

      const { POST } = await import("./execute/route.js");
      const req = new Request("http://localhost/api/workspace/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: 'SELECT "getenv"(\'ENMS_PG_CONNECTION\')' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
      expect(checkSqlSafety).toHaveBeenCalledWith('SELECT "getenv"(\'ENMS_PG_CONNECTION\')');
      expect(duckdbQueryAsync).not.toHaveBeenCalled();
    });
  });
});
