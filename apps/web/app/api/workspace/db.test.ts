import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
}));

describe("Workspace DB & Reports API", () => {
  beforeEach(() => {
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
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    it("executes query and returns rows", async () => {
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
    });

    it("routes ycrm-qualified report SQL to external postgres execution", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);
      const { duckdbQueryAsyncDetailed, duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryAsyncDetailed).mockClear();
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockClear();
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValue({
        rows: [{ stage: "需求確認", cnt: 9 }],
        error: null,
      });

      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: "SELECT * FROM ycrm.workspace_3joxkr9ofo5hlxjan164egffx.opportunity",
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.rows).toEqual([{ stage: "需求確認", cnt: 9 }]);
      expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalled();
      expect(duckdbQueryAsyncDetailed).not.toHaveBeenCalled();
    });

    it("routes erp-qualified report SQL to external postgres execution", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);
      const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValue({
        rows: [{ customer_name: "OOCHAIN", cnt: 3 }],
        error: null,
      });

      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: 'SELECT customer_name, COUNT(*) AS cnt FROM erp.public."SO" GROUP BY customer_name',
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.rows).toEqual([{ customer_name: "OOCHAIN", cnt: 3 }]);
      expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledWith(
        expect.stringContaining("ErpUAT_local"),
        expect.any(String),
        "erp",
      );
    });

    it("routes enms-qualified report SQL to external postgres execution", async () => {
      const { checkSqlSafety } = await import("@/lib/report-filters");
      vi.mocked(checkSqlSafety).mockReturnValue(null);
      const { duckdbQueryExternalPgAsyncDetailed } = await import("@/lib/workspace");
      vi.mocked(duckdbQueryExternalPgAsyncDetailed).mockResolvedValue({
        rows: [{ RecordTime: "2026-05-28 16:00:00+08", MaxDemand: "0.0240" }],
        error: null,
      });

      const { POST } = await import("./reports/execute/route.js");
      const req = new Request("http://localhost/api/workspace/reports/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: 'SELECT "RecordTime", "MaxDemand" FROM enms.public."DeviceDataSummaryView" LIMIT 1',
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.rows).toEqual([{ RecordTime: "2026-05-28 16:00:00+08", MaxDemand: "0.0240" }]);
      expect(duckdbQueryExternalPgAsyncDetailed).toHaveBeenCalledWith(
        expect.stringContaining("dbname=EnMS"),
        expect.any(String),
        "enms",
      );
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
      const { POST } = await import("./query/route.js");
      const req = new Request("http://localhost/api/workspace/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: "DELETE FROM users" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });
  });
});
