import { getSessionMeta, updateSessionPlannerLearningDraft } from "@/app/api/web-sessions/shared";
import { applyYcrmLearningDraftPromotion } from "@/lib/ycrm-learning-draft";
import { promoteYcrmLearningWikiDrafts } from "@/lib/ycrm-learning-promotion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PromoteBody = {
	session_id?: string;
	force_conflict_override?: boolean;
	review_reason?: string;
	reviewer_note?: string;
	reviewer_actor?: string;
};

function normalizeRequiredText(value: string | undefined, fieldLabel: string): string | Response {
	if (typeof value !== "string" || value.trim().length === 0) {
		return Response.json({ error: `Missing '${fieldLabel}' field in request body` }, { status: 400 });
	}
	return value.trim();
}

function normalizeOptionalText(value: string | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

export async function POST(req: Request) {
	let body: PromoteBody;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (!body.session_id || typeof body.session_id !== "string" || body.session_id.trim().length === 0) {
		return Response.json({ error: "Missing 'session_id' field in request body" }, { status: 400 });
	}

	const session = getSessionMeta(body.session_id);
	if (!session?.plannerLearningDraft) {
		return Response.json({ error: "No persisted planner learning draft found for this session" }, { status: 404 });
	}

	const reviewerActor = normalizeRequiredText(body.reviewer_actor, "reviewer_actor");
	if (reviewerActor instanceof Response) {
		return reviewerActor;
	}
	const reviewReason = normalizeRequiredText(body.review_reason, "review_reason");
	if (reviewReason instanceof Response) {
		return reviewReason;
	}
	const reviewerNote = normalizeOptionalText(body.reviewer_note);
	const currentWritebackStatus = session.plannerLearningDraft.writeback.status;
	const forceConflictOverride = body.force_conflict_override === true;

	if (forceConflictOverride && currentWritebackStatus !== "promotion_conflicted") {
		return Response.json(
			{ error: "Force promote is only allowed after a promotion conflict has been recorded" },
			{ status: 409 },
		);
	}

	if (!forceConflictOverride && currentWritebackStatus === "promotion_conflicted") {
		return Response.json(
			{ error: "This draft is currently conflicted and must be resolved with keep-current or force-promote" },
			{ status: 409 },
		);
	}

	if (!forceConflictOverride && currentWritebackStatus !== "written") {
		return Response.json(
			{ error: "This draft is not currently in a promotable state" },
			{ status: 409 },
		);
	}

	const promotion = promoteYcrmLearningWikiDrafts(
		body.session_id,
		session.plannerLearningDraft,
		{ forceConflictOverride },
	);
	const updatedDraft = applyYcrmLearningDraftPromotion(session.plannerLearningDraft, {
		promoted_files: promotion.promoted_files,
		skipped_files: promotion.skipped_files,
		conflict_files: promotion.conflict_files,
		approved_via: forceConflictOverride ? "manual_force_promotion" : "manual_promotion",
		resolution_action: forceConflictOverride ? "force_promote_override" : null,
		review_reason: reviewReason,
		reviewer_note: reviewerNote,
		reviewer_actor: reviewerActor,
	});
	updateSessionPlannerLearningDraft(body.session_id, updatedDraft);

	return Response.json({
		ok: true,
		session_id: body.session_id,
		promotion,
		draft: updatedDraft,
	});
}
