import { getSessionMeta, updateSessionPlannerLearningDraft } from "@/app/api/web-sessions/shared";
import { applyYcrmLearningDraftKeepCurrentResolution } from "@/lib/ycrm-learning-draft";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ResolveBody = {
	session_id?: string;
	resolution_action?: "keep_current_page";
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
	let body: ResolveBody;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (!body.session_id || typeof body.session_id !== "string" || body.session_id.trim().length === 0) {
		return Response.json({ error: "Missing 'session_id' field in request body" }, { status: 400 });
	}

	if (body.resolution_action !== "keep_current_page") {
		return Response.json({ error: "Unsupported resolution action" }, { status: 400 });
	}

	const session = getSessionMeta(body.session_id);
	if (!session?.plannerLearningDraft) {
		return Response.json({ error: "No persisted planner learning draft found for this session" }, { status: 404 });
	}

	if (session.plannerLearningDraft.writeback.status !== "promotion_conflicted") {
		return Response.json(
			{ error: "Only conflicted drafts can be resolved with keep-current" },
			{ status: 409 },
		);
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

	const conflictFiles = session.plannerLearningDraft.writeback.promotion_conflict_files ?? [];
	const updatedDraft = applyYcrmLearningDraftKeepCurrentResolution(session.plannerLearningDraft, {
		conflict_files: conflictFiles,
		review_reason: reviewReason,
		reviewer_note: reviewerNote,
		reviewer_actor: reviewerActor,
	});
	updateSessionPlannerLearningDraft(body.session_id, updatedDraft);

	return Response.json({
		ok: true,
		session_id: body.session_id,
		resolution_action: "keep_current_page",
		draft: updatedDraft,
	});
}
