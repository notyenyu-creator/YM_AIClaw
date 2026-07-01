// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportViewer } from "./report-viewer";
import type { ReportConfig } from "./types";

vi.mock("./chart-panel", () => ({
  ChartPanel: ({ data }: { data: Record<string, unknown>[] }) => (
    <div>viewer chart rows:{data.length}</div>
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReportViewer source badges", () => {
  it("shows trusted verified direct inline rows with DB source badges", async () => {
    const config: ReportConfig = {
      version: 1,
      title: "Pinned inline report",
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

    render(<ReportViewer config={config} />);

    expect(await screen.findByText("資料:EnMS")).toBeInTheDocument();
    expect(screen.getByText("已驗證直查")).toBeInTheDocument();
    expect(screen.queryByText("內嵌資料")).not.toBeInTheDocument();
  });

  it("uses reports execute response as the authority for SQL panel source", async () => {
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
      title: "Pinned SQL report",
      panels: [
        {
          id: "sql",
          title: "SQL panel",
          type: "bar",
          sql: "SELECT 1 AS count",
          rows: [{ label: "spoofed", count: 999 }],
          sourceDomain: "enms",
          sourceKind: "verified_direct",
          mapping: { xAxis: "label", yAxis: ["count"] },
        },
      ],
    };

    render(<ReportViewer config={config} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/workspace/reports/execute",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(await screen.findByText("viewer chart rows:1")).toBeInTheDocument();
    expect(screen.getByText("Workspace DB")).toBeInTheDocument();
    expect(screen.queryByText("資料:EnMS")).not.toBeInTheDocument();
    expect(screen.queryByText("已驗證直查")).not.toBeInTheDocument();
  });
});
