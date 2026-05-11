import {
  getSessionMeta,
  updateSessionErpPlannerLearningDraft,
} from "@/app/api/web-sessions/shared";
import { applyErpLearningDraftWriteback } from "@/lib/erp-learning-draft";
import { writeErpLearningWikiDrafts } from "@/lib/erp-learning-writeback";

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
    !body.session_id
    || typeof body.session_id !== "string"
    || body.session_id.trim().length === 0
  ) {
    return Response.json(
      { error: "Missing 'session_id' field in request body" },
      { status: 400 },
    );
  }

  const existing = getSessionMeta(body.session_id)?.erpPlannerLearningDraft;
  if (!existing) {
    return Response.json(
      {
        error:
          "No ERP learning draft persisted for this session yet. Generate one first via /api/debug/erp-learning-draft.",
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

  const result = writeErpLearningWikiDrafts(body.session_id, existing, {
    overwrite: body.overwrite === true,
  });
  const updated = applyErpLearningDraftWriteback(existing, result);
  updateSessionErpPlannerLearningDraft(body.session_id, updated);

  return Response.json({
    ok: true,
    session_id: body.session_id,
    writeback: result,
    draft: updated,
  });
}
