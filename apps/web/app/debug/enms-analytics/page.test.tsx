// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Page from "./page";

describe("EnMS analytics debug page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the sample forecast, anomaly, and alert outputs", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            analytics: {
              id: "enms_analytics_workbench",
            },
            sampleInput: {
              summaryPoints: [{ maxDemandKw: 99 }],
            },
            output: {
              demandForecast: {
                riskLevel: "critical",
              },
              anomalyDetection: {
                overallSeverity: "critical",
              },
              alertGovernance: {
                alerts: [{ code: "contract_capacity_critical" }],
              },
            },
          }),
        ),
      ),
    ) as typeof fetch;

    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("EnMS Analytics Workbench")).toBeInTheDocument();
    });

    expect(screen.getByText("Demand Forecast, Anomaly Detection, and Alert Governance")).toBeInTheDocument();
    expect(screen.getByText("Sample Input")).toBeInTheDocument();
    expect(screen.getByText("Sample Output")).toBeInTheDocument();
    expect(screen.getAllByText(/critical/i).length).toBeGreaterThan(0);
  });
});
