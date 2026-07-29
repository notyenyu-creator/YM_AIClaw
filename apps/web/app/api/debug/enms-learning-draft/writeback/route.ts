import {
  getSessionMeta,
  updateSessionEnmsPlannerLearningDraft,
} from "@/app/api/web-sessions/shared";
import { applyEnmsLearningDraftWriteback } from "@/lib/enms-learning-draft";
import { writeEnmsLearningRegressionDrafts } from "@/lib/enms-learning-regression";
import { requireEnmsLearningReviewAccess } from "@/lib/enms-learning-review-auth";
import { writeEnmsLearningWikiDrafts } from "@/lib/enms-learning-writeback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DebugRequestBody = {
  session_id?: string;
  overwrite?: boolean;
};

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

  const existing = getSessionMeta(body.session_id)?.enmsPlannerLearningDraft;
  if (!existing) {
    return Response.json(
      {
        error:
          "No EnMS learning draft persisted for this session yet. Generate one first via /api/debug/enms-learning-draft.",
      },
      { status: 404 },
    );
  }

  if (existing.status !== "ready") {
    return Response.json(
      {
        error: `Draft is in status '${existing.status}', not 'ready'. Cannot writeback.`,
      },
      { status: 409 },
    );
  }

  const wikiResult = writeEnmsLearningWikiDrafts(body.session_id, existing, {
    overwrite: body.overwrite === true,
  });
  const regressionResult = writeEnmsLearningRegressionDrafts(
    body.session_id,
    existing,
    {
      overwrite: body.overwrite === true,
    },
  );
  const updated = applyEnmsLearningDraftWriteback(existing, {
    files: wikiResult.files,
    skipped_files: wikiResult.skipped_files,
    regression_files: regressionResult.files,
    regression_skipped_files: regressionResult.skipped_files,
  });
  updateSessionEnmsPlannerLearningDraft(body.session_id, updated);

  return Response.json({
    ok: true,
    session_id: body.session_id,
    writeback: {
      ...wikiResult,
      regression_files: regressionResult.files,
      regression_skipped_files: regressionResult.skipped_files,
    },
    draft: updated,
  });
}
