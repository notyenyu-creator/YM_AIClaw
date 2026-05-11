// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlannerPreflightHeader } from "./planner-preflight-header";

describe("PlannerPreflightHeader", () => {
	it("renders a readable planner status row for the current chat session", () => {
		render(
			<PlannerPreflightHeader
				plannerPreflight={{
					system: "ycrm",
					updatedAt: Date.now(),
					validationState: "heuristic",
					intent: "entity_summary",
					confidence: "high",
					shouldRouteToYcrm: true,
					workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
					needsWorkspaceValidation: false,
					warnings: ["workspace_needs_review"],
					blockers: [],
					crossSystem: true,
					targetSystems: ["erp"],
				}}
				plannerLearningDraft={{
					writeback: {
						status: "promotion_conflicted",
						reviewer_actor: "YM",
						updated_at: 1710000002000,
						files: [],
						skipped_files: [],
						promoted_files: [],
						promotion_skipped_files: [],
						promotion_conflict_files: ["wiki/entities/customers/sample-customer-summary.md"],
					},
				}}
				sessionId="s-review"
			/>,
		);

		expect(screen.getByLabelText("Planner preflight status")).toBeInTheDocument();
		expect(screen.getByText("Y-CRM")).toBeInTheDocument();
		expect(screen.getByText("Advisory")).toBeInTheDocument();
		expect(screen.getByText("intent:entity_summary")).toBeInTheDocument();
		expect(screen.getByText("conf:high")).toBeInTheDocument();
		expect(screen.getByText("Cross-system")).toBeInTheDocument();
		expect(screen.getByText("warn:1")).toBeInTheDocument();
		expect(screen.getByText("ws:workspace_3joxk...")).toBeInTheDocument();
		expect(screen.getByText("Needs review")).toBeInTheDocument();
		expect(screen.getByText("by:YM")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Open review" })).toHaveAttribute(
			"href",
			"/review/ycrm?sessionId=s-review",
		);
		expect(
			screen.getByText("Next: compare the conflicted wiki page before choosing keep current or force promote."),
		).toBeInTheDocument();
	});

	it("does not render anything when planner metadata is unavailable", () => {
		const { container } = render(<PlannerPreflightHeader plannerPreflight={null} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("still renders session review status when planner preflight metadata is missing", () => {
		render(
			<PlannerPreflightHeader
				plannerPreflight={null}
				plannerLearningDraft={{
					writeback: {
						status: "promoted",
						reviewer_actor: "Sales Ops",
						approved_via: "manual_force_promotion",
						updated_at: 1710000003000,
						files: ["wiki/entities/customers/sample-customer-summary.md"],
						skipped_files: [],
						promoted_files: ["wiki/entities/customers/sample-customer-summary.md"],
						promotion_skipped_files: [],
						promotion_conflict_files: [],
					},
				}}
			/>,
		);

		expect(screen.getByLabelText("Planner preflight status")).toBeInTheDocument();
		expect(screen.getByText("Promoted")).toBeInTheDocument();
		expect(screen.getByText("by:Sales Ops")).toBeInTheDocument();
		expect(
			screen.getByText("Promoted: this draft was force-promoted after manual approval."),
		).toBeInTheDocument();
	});

	it("renders ERP planner state without disturbing the Y-CRM review model", () => {
		render(
			<PlannerPreflightHeader
				plannerPreflight={{
					system: "ycrm",
					updatedAt: Date.now(),
					validationState: "heuristic",
					intent: "cross_system_request",
					confidence: "medium",
					shouldRouteToYcrm: false,
					workspaceId: null,
					needsWorkspaceValidation: false,
					warnings: [],
					blockers: [],
					crossSystem: true,
					targetSystems: ["erp"],
				}}
				erpPlannerPreflight={{
					system: "erp",
					updatedAt: Date.now(),
					intent: "sales_order",
					confidence: "high",
					shouldRouteToErp: true,
					matchedKeywords: ["訂單", "出貨"],
					warnings: [],
				}}
				sessionId="erp-review-1"
			/>,
		);

		expect(screen.getByText("ERP")).toBeInTheDocument();
		expect(screen.getByText("Advisory")).toBeInTheDocument();
		expect(screen.getByText("intent:sales_order")).toBeInTheDocument();
		expect(screen.getByText("conf:high")).toBeInTheDocument();
		expect(screen.getByText("Cross-system")).toBeInTheDocument();
		expect(screen.queryByText("Y-CRM")).not.toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Open review" })).toHaveAttribute(
			"href",
			"/review/erp?sessionId=erp-review-1",
		);
	});
});
