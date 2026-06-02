import {
  getSessionMeta,
  updateSessionEnmsPlannerLearningDraft,
} from "@/app/api/web-sessions/shared";
import { applyEnmsLearningDraftWriteback } from "@/lib/enms-learning-draft";
import { writeEnmsLearningWikiDrafts } from "@/lib/enms-learning-writeback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DebugRequestBody = {
  session_id?: string;
  overwrite?: boolean;
};

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

  const result = writeEnmsLearningWikiDrafts(body.session_id, existing, {
    overwrite: body.overwrite === true,
  });
  const updated = applyEnmsLearningDraftWriteback(existing, result);
  updateSessionEnmsPlannerLearningDraft(body.session_id, updated);

  return Response.json({
    ok: true,
    session_id: body.session_id,
    writeback: result,
    draft: updated,
  });
}
