import type { SessionPlannerPreflight } from "@/app/api/web-sessions/shared";
import type { YcrmLearningDraft } from "@/lib/ycrm-learning-draft";

export type PlannerPreflightSummary = SessionPlannerPreflight;
export type PlannerLearningDraftSummary = Pick<YcrmLearningDraft, "writeback"> | null;

function formatPlannerWorkspaceLabel(workspaceId: string | null | undefined): string | null {
	if (!workspaceId) {
		return null;
	}
	if (workspaceId.length <= 18) {
		return workspaceId;
	}
	return `${workspaceId.slice(0, 15)}...`;
}

function PlannerStatusPill({
	label,
	tone = "neutral",
}: {
	label: string;
	tone?: "neutral" | "accent" | "warning" | "success";
}) {
	const toneStyles = {
		neutral: {
			background: "rgba(148, 163, 184, 0.08)",
			color: "var(--color-text-muted)",
			borderColor: "rgba(148, 163, 184, 0.18)",
		},
		accent: {
			background: "var(--color-accent-light)",
			color: "var(--color-accent)",
			borderColor: "rgba(0, 101, 162, 0.18)",
		},
		warning: {
			background: "rgba(217, 119, 6, 0.08)",
			color: "var(--color-warning)",
			borderColor: "rgba(217, 119, 6, 0.18)",
		},
		success: {
			background: "rgba(22, 163, 74, 0.08)",
			color: "var(--color-success)",
			borderColor: "rgba(22, 163, 74, 0.18)",
		},
	} as const;

	return (
		<span
			className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
			style={toneStyles[tone]}
		>
			{label}
		</span>
	);
}

function buildPlannerTitle(plannerPreflight: PlannerPreflightSummary): string {
	const lines = [
		`state: ${plannerPreflight.validationState ?? "heuristic"}`,
		`intent: ${plannerPreflight.intent}`,
		`confidence: ${plannerPreflight.confidence}`,
	];
	if (plannerPreflight.warnings.length > 0) {
		lines.push(`warnings: ${plannerPreflight.warnings.join(", ")}`);
	}
	if (plannerPreflight.blockers.length > 0) {
		lines.push(`blockers: ${plannerPreflight.blockers.join(", ")}`);
	}
	return lines.join("\n");
}

function getLearningDraftStatusPill(
	plannerLearningDraft: PlannerLearningDraftSummary,
): { label: string; tone: "neutral" | "accent" | "warning" | "success" } | null {
	const status = plannerLearningDraft?.writeback?.status;
	if (status === "written") {
		return { label: "Draft ready", tone: "accent" };
	}
	if (status === "promotion_conflicted") {
		return { label: "Needs review", tone: "warning" };
	}
	if (status === "resolution_kept_current") {
		return { label: "Reviewed", tone: "success" };
	}
	if (status === "promoted") {
		return { label: "Promoted", tone: "success" };
	}
	return null;
}

function getLearningDraftNextAction(plannerLearningDraft: PlannerLearningDraftSummary): string | null {
	const status = plannerLearningDraft?.writeback?.status;
	if (status === "written") {
		return "Next: review the draft and decide whether it should be promoted.";
	}
	if (status === "promotion_conflicted") {
		return "Next: compare the conflicted wiki page before choosing keep current or force promote.";
	}
	if (status === "resolution_kept_current") {
		return "Reviewed: the current wiki page was kept and the decision is already recorded.";
	}
	if (status === "promoted") {
		return plannerLearningDraft?.writeback?.approved_via === "manual_force_promotion"
			? "Promoted: this draft was force-promoted after manual approval."
			: "Promoted: this draft has already been written into the wiki registry.";
	}
	return null;
}

export function PlannerPreflightHeader({
	plannerPreflight,
	plannerLearningDraft = null,
	sessionId = null,
}: {
	plannerPreflight: PlannerPreflightSummary | null;
	plannerLearningDraft?: PlannerLearningDraftSummary;
	sessionId?: string | null;
}) {
	if (!plannerPreflight && !plannerLearningDraft) {
		return null;
	}

	const workspaceLabel = formatPlannerWorkspaceLabel(plannerPreflight?.workspaceId);
	const warningCount = plannerPreflight?.warnings.length ?? 0;
	const blockerCount = plannerPreflight?.blockers.length ?? 0;
	const learningDraftStatus = getLearningDraftStatusPill(plannerLearningDraft);
	const learningDraftNextAction = getLearningDraftNextAction(plannerLearningDraft);
	const reviewerActor = plannerLearningDraft?.writeback?.reviewer_actor?.trim() || null;

	return (
		<div aria-label="Planner preflight status" title={plannerPreflight ? buildPlannerTitle(plannerPreflight) : undefined}>
			<div className="mt-1 flex flex-wrap gap-1.5">
				{plannerPreflight?.shouldRouteToYcrm && (
					<PlannerStatusPill label="Y-CRM" tone="accent" />
				)}
				{plannerPreflight ? <PlannerStatusPill label={plannerPreflight.validationState === "validated" ? "Validated" : "Advisory"} /> : null}
				{plannerPreflight ? <PlannerStatusPill label={`intent:${plannerPreflight.intent}`} /> : null}
				{plannerPreflight ? <PlannerStatusPill label={`conf:${plannerPreflight.confidence}`} /> : null}
				{plannerPreflight?.crossSystem && (
					<PlannerStatusPill label="Cross-system" tone="warning" />
				)}
				{blockerCount > 0 && (
					<PlannerStatusPill label={`blocked:${blockerCount}`} tone="warning" />
				)}
				{blockerCount === 0 && warningCount > 0 && (
					<PlannerStatusPill label={`warn:${warningCount}`} tone="warning" />
				)}
				{workspaceLabel && (
					<PlannerStatusPill label={`ws:${workspaceLabel}`} />
				)}
				{learningDraftStatus ? (
					<PlannerStatusPill label={learningDraftStatus.label} tone={learningDraftStatus.tone} />
				) : null}
				{reviewerActor ? (
					<PlannerStatusPill label={`by:${reviewerActor}`} />
				) : null}
				{sessionId && learningDraftStatus ? (
					<a
						href={`/review/ycrm?sessionId=${encodeURIComponent(sessionId)}`}
						className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-90"
						style={{
							background: "rgba(0, 101, 162, 0.08)",
							color: "var(--color-accent)",
							borderColor: "rgba(0, 101, 162, 0.18)",
						}}
					>
						Open review
					</a>
				) : null}
			</div>
			{learningDraftNextAction ? (
				<p
					className="mt-2 text-[11px] leading-5"
					style={{ color: "var(--color-text-muted)" }}
				>
					{learningDraftNextAction}
				</p>
			) : null}
		</div>
	);
}
