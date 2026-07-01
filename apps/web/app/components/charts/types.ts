/** Shared types for the report/analytics system. */

export type ChartType =
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "donut"
  | "radar"
  | "radialBar"
  | "scatter"
  | "funnel";

export type PanelSize = "full" | "half" | "third";

export type ReportSourceDomain = "ycrm" | "erp" | "enms";

export type ReportSourceKind =
  | "workspace_duckdb"
  | "external_postgres"
  | "blocked_external_postgres"
  | "verified_direct"
  | "inline_rows";

export type PanelMapping = {
  /** Key for x-axis or category axis */
  xAxis?: string;
  /** One or more keys for y-axis values (supports stacked/multi-series) */
  yAxis?: string[];
  /** Key used as label for pie/donut/funnel */
  nameKey?: string;
  /** Key used as value for pie/donut/funnel */
  valueKey?: string;
  /** Custom colors for series (hex). Falls back to palette. */
  colors?: string[];
};

export type PanelConfig = {
  id: string;
  title: string;
  type: ChartType;
  sql?: string;
  /** Optional static rows for inline / demo charts. */
  rows?: Record<string, unknown>[];
  /** Alias for rows to be tolerant of older/generated payloads. */
  data?: Record<string, unknown>[];
  /** Optional source metadata for badges and guarded empty states. */
  sourceDomain?: ReportSourceDomain;
  sourceKind?: ReportSourceKind;
  verifiedBy?: string;
  mapping: PanelMapping;
  size?: PanelSize;
};

export type FilterType = "dateRange" | "select" | "multiSelect" | "number";

export type FilterConfig = {
  id: string;
  type: FilterType;
  label: string;
  column: string;
  /** SQL to fetch available options (for select/multiSelect) */
  sql?: string;
};

export type ReportConfig = {
  version: number;
  title: string;
  description?: string;
  panels: PanelConfig[];
  filters?: FilterConfig[];
};

/** Active filter values keyed by filter ID */
export type FilterState = Record<string, FilterValue>;

export type FilterValue =
  | { type: "dateRange"; from?: string; to?: string }
  | { type: "select"; value?: string }
  | { type: "multiSelect"; values?: string[] }
  | { type: "number"; min?: number; max?: number };
