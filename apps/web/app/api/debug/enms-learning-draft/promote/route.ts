import {
  getSessionMeta,
  updateSessionEnmsPlannerLearningDraft,
} from "@/app/api/web-sessions/shared";
import { applyEnmsLearningDraftPromotion } from "@/lib/enms-learning-draft";
import { promoteEnmsLearningWikiDrafts } from "@/lib/enms-learning-promotion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DebugRequestBody = {
  session_id?: string;
  force_conflict_override?: boolean;
  review_reason?: string;
  reviewer_note?: string;
  reviewer_actor?: string;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(req: Request) {
  let body: DebugRequestBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body.session_id ||
    typeof body.session_id !== "string" ||
    body.session_id.trim().length === 0
  ) {
    return Response.json(
      { error: "Missing 'session_id' field in request body" },
      { status: 400 },
    );
  }

  const reviewReason = normalizeText(body.review_reason);
  const reviewerActor = normalizeText(body.reviewer_actor);
  const forceOverride = body.force_conflict_override === true;

  if (!reviewerActor) {
    return Response.json(
      { error: "Missing 'reviewer_actor' field (required for audit)" },
      { status: 400 },
    );
  }
  if (!reviewReason) {
    return Response.json(
      { error: "Missing 'review_reason' field (required for audit)" },
      { status: 400 },
    );
  }

  const existing = getSessionMeta(body.session_id)?.enmsPlannerLearningDraft;
  if (!existing) {
    return Response.json(
      { error: "No EnMS learning draft persisted for this session." },
      { status: 404 },
    );
  }

  if (!forceOverride && existing.writeback.status !== "written") {
    return Response.json(
      {
        error: `Draft is in status '${existing.writeback.status}', expected 'written'. Use force_conflict_override=true on conflicted drafts.`,
      },
      { status: 409 },
    );
  }
  if (forceOverride && existing.writeback.status !== "promotion_conflicted") {
    return Response.json(
      {
        error: `Force override requires status 'promotion_conflicted', got '${existing.writeback.status}'.`,
      },
      { status: 409 },
    );
  }

  const result = promoteEnmsLearningWikiDrafts(body.session_id, existing, {
    forceConflictOverride: forceOverride,
  });

  const updated = applyEnmsLearningDraftPromotion(existing, {
    promoted_files: result.promoted_files,
    skipped_files: result.skipped_files,
    conflict_files: result.conflict_files,
    approved_via: forceOverride ? "manual_force_promotion" : "manual_promotion",
    resolution_action: forceOverride ? "force_promote_override" : null,
    review_reason: reviewReason,
    reviewer_note: normalizeText(body.reviewer_note),
    reviewer_actor: reviewerActor,
  });
  updateSessionEnmsPlannerLearningDraft(body.session_id, updated);

  return Response.json({
    ok: true,
    session_id: body.session_id,
    promotion: result,
    draft: updated,
  });
}
