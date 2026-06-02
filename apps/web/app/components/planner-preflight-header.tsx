import type { SessionPlannerPreflight } from "@/app/api/web-sessions/shared";
import type { ErpPlannerPreflight } from "@/lib/erp-context-builder";
import type { ErpLearningDraft } from "@/lib/erp-learning-draft";
import type { EnmsPlannerPreflight } from "@/lib/enms-context-builder";
import type { EnmsLearningDraft } from "@/lib/enms-learning-draft";
import type { YcrmLearningDraft } from "@/lib/ycrm-learning-draft";

export type PlannerPreflightSummary = SessionPlannerPreflight;
export type ErpPlannerPreflightSummary = ErpPlannerPreflight;
export type EnmsPlannerPreflightSummary = EnmsPlannerPreflight;
export type PlannerLearningDraftSummary = Pick<YcrmLearningDraft, "writeback"> | null;
export type ErpPlannerLearningDraftSummary = Pick<ErpLearningDraft, "writeback"> | null;
export type EnmsPlannerLearningDraftSummary = Pick<EnmsLearningDraft, "writeback"> | null;

type PlannerSystem = "ycrm" | "erp" | "enms";
type AnyPlannerPreflight =
	| PlannerPreflightSummary
	| ErpPlannerPreflightSummary
	| EnmsPlannerPreflightSummary;
type AnyLearningDraftSummary =
	| PlannerLearningDraftSummary
	| ErpPlannerLearningDraftSummary
	| EnmsPlannerLearningDraftSummary;

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

function buildPlannerTitle(
	plannerPreflight: AnyPlannerPreflight,
): string {
	const lines = [
		`system: ${plannerPreflight.system}`,
		`state: ${"validationState" in plannerPreflight ? (plannerPreflight.validationState ?? "heuristic") : "heuristic"}`,
		`intent: ${plannerPreflight.intent}`,
		`confidence: ${plannerPreflight.confidence}`,
	];
	if (plannerPreflight.warnings.length > 0) {
		lines.push(`warnings: ${plannerPreflight.warnings.join(", ")}`);
	}
	if ("blockers" in plannerPreflight && plannerPreflight.blockers.length > 0) {
		lines.push(`blockers: ${plannerPreflight.blockers.join(", ")}`);
	}
	return lines.join("\n");
}

function getLearningDraftStatusPill(
	plannerLearningDraft: AnyLearningDraftSummary,
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

function getLearningDraftNextAction(
	plannerLearningDraft: AnyLearningDraftSummary,
): string | null {
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
	erpPlannerPreflight = null,
	enmsPlannerPreflight = null,
	plannerLearningDraft = null,
	erpPlannerLearningDraft = null,
	enmsPlannerLearningDraft = null,
	sessionId = null,
}: {
	plannerPreflight: PlannerPreflightSummary | null;
	erpPlannerPreflight?: ErpPlannerPreflightSummary | null;
	enmsPlannerPreflight?: EnmsPlannerPreflightSummary | null;
	plannerLearningDraft?: PlannerLearningDraftSummary;
	erpPlannerLearningDraft?: ErpPlannerLearningDraftSummary;
	enmsPlannerLearningDraft?: EnmsPlannerLearningDraftSummary;
	sessionId?: string | null;
}) {
	if (
		!plannerPreflight
		&& !erpPlannerPreflight
		&& !enmsPlannerPreflight
		&& !plannerLearningDraft
		&& !erpPlannerLearningDraft
		&& !enmsPlannerLearningDraft
	) {
		return null;
	}

	const effectivePlanner = enmsPlannerPreflight?.shouldRouteToEnms
		? enmsPlannerPreflight
		: erpPlannerPreflight?.shouldRouteToErp
			? erpPlannerPreflight
			: plannerPreflight;
	const effectiveSystem: PlannerSystem | null = effectivePlanner?.system ?? null;
	const workspaceLabel = formatPlannerWorkspaceLabel(plannerPreflight?.workspaceId);
	const warningCount = effectivePlanner?.warnings.length ?? 0;
	const blockerCount = plannerPreflight?.blockers.length ?? 0;

	const tonePriority = { warning: 3, accent: 2, success: 1, neutral: 0 } as const;
	const draftCandidates = [
		{ system: "ycrm" as const, draft: plannerLearningDraft, pill: getLearningDraftStatusPill(plannerLearningDraft) },
		{ system: "erp" as const, draft: erpPlannerLearningDraft, pill: getLearningDraftStatusPill(erpPlannerLearningDraft) },
		{ system: "enms" as const, draft: enmsPlannerLearningDraft, pill: getLearningDraftStatusPill(enmsPlannerLearningDraft) },
	].filter(
		(candidate): candidate is {
			system: PlannerSystem;
			draft: AnyLearningDraftSummary;
			pill: { label: string; tone: "neutral" | "accent" | "warning" | "success" };
		} => Boolean(candidate.pill),
	);
	const activeDraft: {
		system: PlannerSystem;
		draft: AnyLearningDraftSummary;
		pill: { label: string; tone: "neutral" | "accent" | "warning" | "success" };
	} | null = draftCandidates.reduce<typeof activeDraft>((best, candidate) => {
		if (!best) {
			return candidate;
		}
		const bestPriority = tonePriority[best.pill.tone];
		const nextPriority = tonePriority[candidate.pill.tone];
		if (nextPriority > bestPriority) {
			return candidate;
		}
		if (nextPriority === bestPriority && candidate.system === effectiveSystem) {
			return candidate;
		}
		return best;
	}, null);

	const learningDraftStatus = activeDraft?.pill ?? null;
	const learningDraftNextAction = activeDraft
		? getLearningDraftNextAction(activeDraft.draft)
		: null;
	const reviewerActor = activeDraft?.draft?.writeback?.reviewer_actor?.trim() || null;
	const reviewSystem: PlannerSystem | null = activeDraft?.system
		?? (enmsPlannerPreflight?.shouldRouteToEnms
			? "enms"
			: erpPlannerPreflight?.shouldRouteToErp
				? "erp"
				: plannerPreflight?.shouldRouteToYcrm
					? "ycrm"
					: null);
	const reviewHref = sessionId
		? reviewSystem
			? `/review/${reviewSystem}?sessionId=${encodeURIComponent(sessionId)}`
			: null
		: null;
	const reviewTitle = reviewSystem === "erp"
		? "Open the formal ERP review workspace for this session"
		: reviewSystem === "enms"
			? "Open the formal EnMS review workspace for this session"
			: "Open the formal Y-CRM review workspace for this session";

	return (
		<div aria-label="Planner preflight status" title={effectivePlanner ? buildPlannerTitle(effectivePlanner) : undefined}>
			<div className="mt-1 flex flex-wrap gap-1.5">
				{plannerPreflight?.shouldRouteToYcrm && (
					<PlannerStatusPill label="Y-CRM" tone="accent" />
				)}
				{erpPlannerPreflight?.shouldRouteToErp && (
					<PlannerStatusPill label="ERP" tone="accent" />
				)}
				{enmsPlannerPreflight?.shouldRouteToEnms && (
					<PlannerStatusPill label="EnMS" tone="accent" />
				)}
				{effectivePlanner ? (
					<PlannerStatusPill
						label={
							"validationState" in effectivePlanner && effectivePlanner.validationState === "validated"
								? "Validated"
								: "Advisory"
						}
					/>
				) : null}
				{effectivePlanner ? <PlannerStatusPill label={`intent:${effectivePlanner.intent}`} /> : null}
				{effectivePlanner ? <PlannerStatusPill label={`conf:${effectivePlanner.confidence}`} /> : null}
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
				{reviewHref ? (
					<a
						href={reviewHref}
						className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-90"
						style={{
							background: "rgba(0, 101, 162, 0.08)",
							color: "var(--color-accent)",
							borderColor: "rgba(0, 101, 162, 0.18)",
						}}
						title={reviewTitle}
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
