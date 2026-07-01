// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartPanel } from "./chart-panel";
import type { PanelConfig } from "./types";

const panel: PanelConfig = {
  id: "empty",
  title: "Empty Panel",
  type: "bar",
  mapping: {
    xAxis: "label",
    yAxis: ["count"],
  },
};

describe("ChartPanel", () => {
  it("shows a clear guarded empty state for empty rows", () => {
    render(<ChartPanel config={panel} data={[]} compact />);

    expect(screen.getByText("沒有可視覺化資料")).toBeInTheDocument();
    expect(
      screen.getByText("目前沒有足夠資料可繪製圖表。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No data")).not.toBeInTheDocument();
  });
});
