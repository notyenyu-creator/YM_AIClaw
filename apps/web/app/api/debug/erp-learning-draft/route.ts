import {
  getSessionMeta,
  updateSessionErpPlannerLearningDraft,
} from "@/app/api/web-sessions/shared";
import {
  buildErpLearningDraft,
  markErpLearningDraftAsCached,
  type ErpLearningDraftInput,
} from "@/lib/erp-learning-draft";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DebugRequestBody = Partial<ErpLearningDraftInput> & {
  force_regenerate?: boolean;
};

export async function GET() {
  const sampleInput: ErpLearningDraftInput = {
    session_id: "s-erp-learning-sample",
    planner_preflight: {
      system: "erp",
      updatedAt: Date.now(),
      intent: "inventory_status",
      confidence: "high",
      shouldRouteToErp: true,
      matchedKeywords: ["庫存"],
      warnings: [],
      presentation: {
        optional_chart_requested: false,
        chart_render_allowed: false,
        chart_guardrail_reason: null,
        max_chart_panels: 0,
      },
    },
    planner_context_pack: null,
    messages: [
      {
        id: "m-user",
        role: "user",
        content: "目前可用庫存最多的前 10 個商品？",
      },
      {
        id: "m-assistant",
        role: "assistant",
        content: "已整理出前 10 個商品的可用庫存量。",
      },
    ],
  };
  return Response.json({
    ok: true,
    description: "Debug route for the ERP learning-loop draft prototype.",
    usage: {
      method: "POST",
      body: {
        session_id: "s1",
        planner_preflight: sampleInput.planner_preflight,
        planner_context_pack: sampleInput.planner_context_pack,
        messages: sampleInput.messages,
      },
    },
    defaults: sampleInput,
    sample_output: buildErpLearningDraft(sampleInput),
  });
}

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

  // Use cache when force_regenerate is false and we already have a draft.
  if (body.force_regenerate !== true) {
    const existing = getSessionMeta(body.session_id)?.erpPlannerLearningDraft;
    if (existing) {
      return Response.json({
        ok: true,
        cached: true,
        input: { session_id: body.session_id },
        draft: markErpLearningDraftAsCached(existing),
      });
    }
  }

  // Pull planner artifacts from session metadata when not supplied in body.
  // This lets the chat-session-driven flow trigger draft generation without
  // re-sending the planner payload.
  const sessionMeta = getSessionMeta(body.session_id);
  const input: ErpLearningDraftInput = {
    session_id: body.session_id,
    planner_preflight:
      body.planner_preflight ?? sessionMeta?.erpPlannerPreflight ?? null,
    planner_context_pack:
      body.planner_context_pack ?? sessionMeta?.erpPlannerContextPack ?? null,
    messages: Array.isArray(body.messages) ? body.messages : [],
  };
  const draft = buildErpLearningDraft(input);
  updateSessionErpPlannerLearningDraft(input.session_id, draft);

  return Response.json({ ok: true, input, draft });
}
