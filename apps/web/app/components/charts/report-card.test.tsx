// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportCard } from "./report-card";
import type { ReportConfig } from "./types";

vi.mock("./chart-panel", () => ({
  ChartPanel: ({ data }: { data: Record<string, unknown>[] }) => (
    <div>chart rows:{data.length}</div>
  ),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReportCard source badges", () => {
  it("shows trusted verified direct inline rows with DB source badges", async () => {
    const config: ReportConfig = {
      version: 1,
      title: "Inline verified report",
      panels: [
        {
          id: "inline",
          title: "Inline panel",
          type: "bar",
          rows: [{ label: "A", count: 1 }],
          sourceDomain: "enms",
          sourceKind: "verified_direct",
          mapping: { xAxis: "label", yAxis: ["count"] },
        },
      ],
    };

    render(<ReportCard config={config} />);

    expect(await screen.findByText("資料:EnMS")).toBeInTheDocument();
    expect(screen.getByText("已驗證直查")).toBeInTheDocument();
    expect(screen.queryByText("內嵌資料")).not.toBeInTheDocument();
  });

  it("does not trust report-json source metadata for SQL panels", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rows: [{ label: "A", count: 1 }],
        sourceDomain: null,
        sourceKind: "workspace_duckdb",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const config: ReportConfig = {
      version: 1,
      title: "SQL report",
      panels: [
        {
          id: "sql",
          title: "SQL panel",
          type: "bar",
          sql: "SELECT 1 AS count",
          sourceDomain: "enms",
          sourceKind: "verified_direct",
          mapping: { xAxis: "label", yAxis: ["count"] },
        },
      ],
    };

    render(<ReportCard config={config} />);

    await waitFor(() => {
      expect(screen.getByText("chart rows:1")).toBeInTheDocument();
    });
    expect(screen.queryByText("資料:EnMS")).not.toBeInTheDocument();
    expect(screen.queryByText("已驗證直查")).not.toBeInTheDocument();
    expect(screen.getByText("Workspace DB")).toBeInTheDocument();
  });

  it("executes SQL panels even when report-json also includes inline rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rows: [{ label: "server", count: 2 }],
        sourceDomain: null,
        sourceKind: "workspace_duckdb",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const config: ReportConfig = {
      version: 1,
      title: "SQL plus rows report",
      panels: [
        {
          id: "sql-rows",
          title: "SQL plus rows panel",
          type: "bar",
          sql: "SELECT 2 AS count",
          rows: [{ label: "spoofed", count: 1 }],
          sourceDomain: "enms",
          sourceKind: "verified_direct",
          mapping: { xAxis: "label", yAxis: ["count"] },
        },
      ],
    };

    render(<ReportCard config={config} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/workspace/reports/execute",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
    expect(await screen.findByText("chart rows:1")).toBeInTheDocument();
    expect(screen.queryByText("資料:EnMS")).not.toBeInTheDocument();
    expect(screen.queryByText("已驗證直查")).not.toBeInTheDocument();
    expect(screen.getByText("Workspace DB")).toBeInTheDocument();
  });
});
