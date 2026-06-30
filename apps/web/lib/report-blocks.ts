/**
 * Pure utility functions for parsing report-json blocks from chat text.
 * Extracted from chat-message.tsx for testability.
 */

import type {
  ChartType,
  PanelConfig,
  PanelSize,
  ReportConfig,
} from "../app/components/charts/types";

export type { ReportConfig };

export type ParsedSegment =
  | { type: "text"; text: string }
  | { type: "report-artifact"; config: ReportConfig };

const CHART_TYPES = new Set<ChartType>([
  "bar",
  "line",
  "area",
  "pie",
  "donut",
  "radar",
  "radialBar",
  "scatter",
  "funnel",
]);

const PANEL_SIZES = new Set<PanelSize>(["full", "half", "third"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {return undefined;}
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function stringArrayOrUndefined(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : undefined;
  }

  if (!Array.isArray(value)) {return undefined;}

  const strings = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return strings.length > 0 ? strings : undefined;
}

function rowsOrUndefined(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) {return undefined;}
  return value.filter(isRecord);
}

function normalizeMapping(value: unknown): PanelConfig["mapping"] | null {
  if (!isRecord(value)) {return null;}

  const mapping: PanelConfig["mapping"] = {};
  const xAxis = stringOrUndefined(value.xAxis);
  const yAxis = stringArrayOrUndefined(value.yAxis);
  const nameKey = stringOrUndefined(value.nameKey);
  const valueKey = stringOrUndefined(value.valueKey);
  const colors = stringArrayOrUndefined(value.colors);

  if (xAxis) {mapping.xAxis = xAxis;}
  if (yAxis) {mapping.yAxis = yAxis;}
  if (nameKey) {mapping.nameKey = nameKey;}
  if (valueKey) {mapping.valueKey = valueKey;}
  if (Array.isArray(value.colors) && colors) {mapping.colors = colors;}

  return mapping;
}

function normalizePanel(value: unknown): PanelConfig | null {
  if (!isRecord(value)) {return null;}

  const id = stringOrUndefined(value.id);
  const title = stringOrUndefined(value.title);
  const type = stringOrUndefined(value.type);
  const mapping = normalizeMapping(value.mapping);

  if (!id || !title || !type || !CHART_TYPES.has(type as ChartType) || !mapping) {
    return null;
  }

  const sql = stringOrUndefined(value.sql);
  const hasRows = Array.isArray(value.rows);
  const hasData = Array.isArray(value.data);
  const rows = rowsOrUndefined(value.rows);
  const data = rowsOrUndefined(value.data);

  if (!sql && !hasRows && !hasData) {
    return null;
  }

  const panel: PanelConfig = {
    id,
    title,
    type: type as ChartType,
    mapping,
  };

  if (sql) {panel.sql = sql;}
  if (rows) {panel.rows = rows;}
  if (data) {panel.data = data;}

  const size = stringOrUndefined(value.size);
  if (size && PANEL_SIZES.has(size as PanelSize)) {
    panel.size = size as PanelSize;
  }

  return panel;
}

function normalizeReportConfig(value: unknown): ReportConfig | null {
  if (!isRecord(value) || !Array.isArray(value.panels)) {return null;}

  const panels: PanelConfig[] = [];
  for (const panelValue of value.panels) {
    const panel = normalizePanel(panelValue);
    if (!panel) {return null;}
    panels.push(panel);
  }

  const config: ReportConfig = {
    version: typeof value.version === "number" ? value.version : 1,
    title: stringOrUndefined(value.title) ?? "Report",
    panels,
  };

  const description = stringOrUndefined(value.description);
  if (description) {config.description = description;}
  if (Array.isArray(value.filters)) {
    config.filters = value.filters as ReportConfig["filters"];
  }

  return config;
}

/**
 * Split text containing ```report-json ... ``` fenced blocks into
 * alternating text and report-artifact segments.
 */
export function splitReportBlocks(text: string): ParsedSegment[] {
  const reportFenceRegex = /```report-json\s*\n([\s\S]*?)```/g;
  const segments: ParsedSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(reportFenceRegex)) {
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) {
      segments.push({ type: "text", text: before });
    }

    try {
      const config = normalizeReportConfig(JSON.parse(match[1]));
      if (config) {
        segments.push({ type: "report-artifact", config });
      } else {
        // Invalid report config -- render as plain text
        segments.push({ type: "text", text: match[0] });
      }
    } catch {
      // Invalid JSON -- render as plain text
      segments.push({ type: "text", text: match[0] });
    }

    lastIndex = (match.index ?? 0) + match[0].length;
  }

  const remaining = text.slice(lastIndex);
  if (remaining.trim()) {
    segments.push({ type: "text", text: remaining });
  }

  return segments;
}

/**
 * Check if text contains any report-json fenced blocks.
 */
export function hasReportBlocks(text: string): boolean {
  return text.includes("```report-json");
}
