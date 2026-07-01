/**
 * Pure utility functions for report filter SQL injection.
 * Extracted from the execute API route for testability.
 */

export type FilterValue =
  | { type: "dateRange"; from?: string; to?: string }
  | { type: "select"; value?: string }
  | { type: "multiSelect"; values?: string[] }
  | { type: "number"; min?: number; max?: number };

export type FilterEntry = {
  id: string;
  column: string;
  value: FilterValue;
};

/** Escape single quotes in SQL string values. */
export function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

/**
 * Build WHERE clause fragments from active filters.
 * Returns an array of SQL condition strings (safe -- values are escaped).
 */
export function buildFilterClauses(filters?: FilterEntry[]): string[] {
  if (!filters || filters.length === 0) {return [];}

  const clauses: string[] = [];

  for (const f of filters) {
    const col = `"${f.column.replace(/"/g, '""')}"`;
    const v = f.value;

    if (v.type === "dateRange") {
      if (v.from) {
        clauses.push(`${col} >= '${escapeSqlString(v.from)}'`);
      }
      if (v.to) {
        clauses.push(`${col} <= '${escapeSqlString(v.to)}'`);
      }
    } else if (v.type === "select" && v.value) {
      clauses.push(`${col} = '${escapeSqlString(v.value)}'`);
    } else if (v.type === "multiSelect" && v.values && v.values.length > 0) {
      const vals = v.values.map((x) => `'${escapeSqlString(x)}'`).join(", ");
      clauses.push(`${col} IN (${vals})`);
    } else if (v.type === "number") {
      if (v.min !== undefined) {
        clauses.push(`CAST(${col} AS NUMERIC) >= ${Number(v.min)}`);
      }
      if (v.max !== undefined) {
        clauses.push(`CAST(${col} AS NUMERIC) <= ${Number(v.max)}`);
      }
    }
  }

  return clauses;
}

/**
 * Inject filter WHERE clauses into a SQL query.
 * Strategy: wrap the original query as a CTE and filter on top.
 */
export function injectFilters(sql: string, filterClauses: string[]): string {
  if (filterClauses.length === 0) {return sql;}

  const whereClause = filterClauses.join(" AND ");
  // Wrap original SQL as CTE to avoid parsing complexities
  return `WITH __report_data AS (${sql.replace(/;+$/g, "")}) SELECT * FROM __report_data WHERE ${whereClause}`;
}

/**
 * Check if SQL is read-only (no mutation statements).
 * Returns an error message if unsafe, or null if safe.
 */
export function checkSqlSafety(sql: string): string | null {
  const trimmed = sql.trim();
  if (!trimmed) {
    return "Only SELECT queries are allowed in reports";
  }

  const sqlForSafety = maskSqlLiteralsAndComments(trimmed).replace(/;+$/g, "").trim();
  const sqlForFunctionSafety = maskSqlStringLiteralsAndComments(trimmed).replace(/;+$/g, "").trim();
  if (sqlForSafety.includes(";")) {
    return "Only one SELECT query is allowed in reports";
  }
  if (hasDuckdbReplacementFileScan(trimmed)) {
    return "Only approved report queries are allowed; file path scans are not allowed";
  }

  const startsWithAllowedRead =
    /^(SELECT|WITH)\b/i.test(sqlForSafety) ||
    /^EXPLAIN\s+(SELECT|WITH)\b/i.test(sqlForSafety);

  if (!startsWithAllowedRead) {
    return "Only SELECT queries are allowed in reports";
  }

  const forbiddenKeywords = [
    "DROP",
    "DELETE",
    "INSERT",
    "UPDATE",
    "ALTER",
    "CREATE",
    "TRUNCATE",
    "ATTACH",
    "DETACH",
    "INSTALL",
    "LOAD",
    "COPY",
    "EXPORT",
    "IMPORT",
    "GRANT",
    "REVOKE",
    "MERGE",
    "PRAGMA",
    "CALL",
    "SET",
    "VACUUM",
    "BEGIN",
    "COMMIT",
    "ROLLBACK",
  ];
  for (const keyword of forbiddenKeywords) {
    if (new RegExp(`\\b${keyword}\\b`, "i").test(sqlForSafety)) {
      return "Only SELECT queries are allowed in reports";
    }
  }

  const forbiddenDuckdbReaders = [
    "GETENV",
    "POSTGRES_SCAN",
    "POSTGRES_SCAN_PUSHDOWN",
    "POSTGRES_QUERY",
    "POSTGRES_EXECUTE",
    "POSTGRES_ATTACH",
    "QUERY",
    "QUERY_TABLE",
    "READ_CSV",
    "READ_CSV_AUTO",
    "READ_JSON",
    "READ_JSON_AUTO",
    "READ_JSON_OBJECTS",
    "READ_JSON_OBJECTS_AUTO",
    "READ_NDJSON",
    "READ_NDJSON_AUTO",
    "READ_NDJSON_OBJECTS",
    "READ_PARQUET",
    "READ_DUCKDB",
    "SNIFF_CSV",
    "PARQUET_SCAN",
    "CSV_SCAN",
    "JSON_SCAN",
    "JSON_DESERIALIZE_SQL",
    "JSON_EXECUTE_SERIALIZED_SQL",
    "JSON_SERIALIZE_SQL",
    "READ_TEXT",
    "READ_BLOB",
    "GLOB",
  ];
  for (const functionName of forbiddenDuckdbReaders) {
    const functionPattern = new RegExp(
      `(?:\\b${functionName}\\b|"${functionName}")\\s*\\(`,
      "i",
    );
    if (functionPattern.test(sqlForFunctionSafety)) {
      return "Only approved report queries are allowed; file-reading or dynamic SQL functions are not allowed";
    }
  }

  return null;
}

function hasDuckdbReplacementFileScan(sql: string): boolean {
  let i = 0;
  let parenDepth = 0;
  let inFromClause = false;
  let fromClauseDepth: number | null = null;
  let pendingTableReference = false;

  while (i < sql.length) {
    const char = sql[i];
    const next = sql[i + 1];

    if (char === "-" && next === "-") {
      i += 2;
      while (i < sql.length && sql[i] !== "\n" && sql[i] !== "\r") {
        i += 1;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
        i += 1;
      }
      i = i < sql.length ? i + 2 : i;
      continue;
    }

    if (char === "'") {
      if (pendingTableReference) {
        return true;
      }
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (char === '"') {
      pendingTableReference = false;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          i += 2;
          continue;
        }
        if (sql[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      pendingTableReference = false;
      i += 1;
      continue;
    }

    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      pendingTableReference = false;
      i += 1;
      continue;
    }

    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    if (char === "," && inFromClause && parenDepth === fromClauseDepth) {
      pendingTableReference = true;
      i += 1;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = i;
      i += 1;
      while (i < sql.length && /[A-Za-z0-9_]/.test(sql[i])) {
        i += 1;
      }
      const word = sql.slice(start, i).toUpperCase();
      if (word === "FROM" || word === "JOIN") {
        inFromClause = true;
        fromClauseDepth = parenDepth;
        pendingTableReference = true;
        continue;
      }
      if (
        word === "WHERE" ||
        word === "GROUP" ||
        word === "ORDER" ||
        word === "HAVING" ||
        word === "QUALIFY" ||
        word === "LIMIT" ||
        word === "UNION" ||
        word === "EXCEPT" ||
        word === "INTERSECT"
      ) {
        inFromClause = false;
        fromClauseDepth = null;
        pendingTableReference = false;
        continue;
      }
      pendingTableReference = false;
      continue;
    }

    pendingTableReference = false;
    i += 1;
  }

  return false;
}

export function maskSqlLiteralsAndComments(sql: string): string {
  return maskSqlForSafety(sql, { maskDoubleQuotedIdentifiers: true });
}

function maskSqlStringLiteralsAndComments(sql: string): string {
  return maskSqlForSafety(sql, { maskDoubleQuotedIdentifiers: false });
}

function maskSqlForSafety(
  sql: string,
  options: { maskDoubleQuotedIdentifiers: boolean },
): string {
  let out = "";
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];
    const next = sql[i + 1];

    if (char === "-" && next === "-") {
      i += 2;
      while (i < sql.length && sql[i] !== "\n" && sql[i] !== "\r") {
        i += 1;
      }
      if (i < sql.length) {
        out += sql[i];
        i += 1;
      } else {
        out += " ";
      }
      continue;
    }

    if (char === "/" && next === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
        i += 1;
      }
      i = i < sql.length ? i + 2 : i;
      out += " ";
      continue;
    }

    if (char === "'") {
      out += "''";
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (char === '"') {
      if (options.maskDoubleQuotedIdentifiers) {
        out += '""';
      } else {
        out += char;
      }
      i += 1;
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          if (!options.maskDoubleQuotedIdentifiers) {
            out += sql[i] + sql[i + 1];
          }
          i += 2;
          continue;
        }
        if (sql[i] === '"') {
          if (!options.maskDoubleQuotedIdentifiers) {
            out += sql[i];
          }
          i += 1;
          break;
        }
        if (!options.maskDoubleQuotedIdentifiers) {
          out += sql[i];
        }
        i += 1;
      }
      continue;
    }

    out += char;
    i += 1;
  }

  return out;
}
