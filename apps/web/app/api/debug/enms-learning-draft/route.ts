import {
  getSessionMeta,
  updateSessionEnmsPlannerLearningDraft,
} from "@/app/api/web-sessions/shared";
import {
  buildEnmsLearningDraft,
  markEnmsLearningDraftAsCached,
  type EnmsLearningDraftInput,
} from "@/lib/enms-learning-draft";
import { requireEnmsLearningReviewAccess } from "@/lib/enms-learning-review-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DebugRequestBody = Partial<EnmsLearningDraftInput> & {
  force_regenerate?: boolean;
};

export async function GET(req: Request) {
  const accessError = requireEnmsLearningReviewAccess(req);
  if (accessError) {
    return accessError;
  }

  const sessionId = new URL(req.url).searchParams.get("session_id")?.trim();
  if (sessionId) {
    const draft = getSessionMeta(sessionId)?.enmsPlannerLearningDraft ?? null;
    return Response.json({
      ok: true,
      session_id: sessionId,
      draft,
    });
  }

  const sampleInput: EnmsLearningDraftInput = {
    session_id: "s-enms-learning-sample",
    planner_preflight: {
      system: "enms",
      updatedAt: Date.now(),
      intent: "demand_forecast",
      confidence: "high",
      shouldRouteToEnms: true,
      matchedKeywords: ["需量", "超約"],
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
        content: "請分析這週最大需量和超約風險。",
      },
      {
        id: "m-assistant",
        role: "assistant",
        content: "已整理出三個場域的需量趨勢與風險。",
      },
    ],
  };
  return Response.json({
    ok: true,
    description: "Debug route for the EnMS learning-loop draft prototype.",
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
    sample_output: buildEnmsLearningDraft(sampleInput),
  });
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

  if (body.force_regenerate !== true) {
    const existing = getSessionMeta(body.session_id)?.enmsPlannerLearningDraft;
    if (existing) {
      return Response.json({
        ok: true,
        cached: true,
        input: { session_id: body.session_id },
        draft: markEnmsLearningDraftAsCached(existing),
      });
    }
  }

  const sessionMeta = getSessionMeta(body.session_id);
  const input: EnmsLearningDraftInput = {
    session_id: body.session_id,
    planner_preflight:
      body.planner_preflight ?? sessionMeta?.enmsPlannerPreflight ?? null,
    planner_context_pack:
      body.planner_context_pack ?? sessionMeta?.enmsPlannerContextPack ?? null,
    messages: Array.isArray(body.messages) ? body.messages : [],
  };
  const draft = buildEnmsLearningDraft(input);
  updateSessionEnmsPlannerLearningDraft(input.session_id, draft);

  return Response.json({ ok: true, input, draft });
}
