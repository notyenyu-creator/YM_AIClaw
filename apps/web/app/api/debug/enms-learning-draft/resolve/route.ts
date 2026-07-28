import {
  getSessionMeta,
  updateSessionEnmsPlannerLearningDraft,
} from "@/app/api/web-sessions/shared";
import { applyEnmsLearningDraftKeepCurrentResolution } from "@/lib/enms-learning-draft";
import { requireEnmsLearningReviewAccess } from "@/lib/enms-learning-review-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DebugRequestBody = {
  session_id?: string;
  resolution_action?: "keep_current_page";
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
  const accessError = requireEnmsLearningReviewAccess(req);
  if (accessError) {
    return accessError;
  }

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

  if (body.resolution_action !== "keep_current_page") {
    return Response.json(
      { error: "Only 'keep_current_page' resolution is supported." },
      { status: 400 },
    );
  }

  const reviewerActor = normalizeText(body.reviewer_actor);
  const reviewReason = normalizeText(body.review_reason);

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
  if (existing.writeback.status !== "promotion_conflicted") {
    return Response.json(
      {
        error: `Resolution only valid on 'promotion_conflicted' drafts; current status is '${existing.writeback.status}'.`,
      },
      { status: 409 },
    );
  }

  const updated = applyEnmsLearningDraftKeepCurrentResolution(existing, {
    conflict_files: existing.writeback.promotion_conflict_files,
    review_reason: reviewReason,
    reviewer_note: normalizeText(body.reviewer_note),
    reviewer_actor: reviewerActor,
  });
  updateSessionEnmsPlannerLearningDraft(body.session_id, updated);

  return Response.json({
    ok: true,
    session_id: body.session_id,
    draft: updated,
  });
}
