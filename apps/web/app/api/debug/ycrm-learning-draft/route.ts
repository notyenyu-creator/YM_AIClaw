import { getSessionMeta, updateSessionPlannerLearningDraft } from "@/app/api/web-sessions/shared";
import {
  buildYcrmLearningDraft,
  markYcrmLearningDraftAsCached,
  type YcrmLearningDraftInput,
} from "@/lib/ycrm-learning-draft";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DebugRequestBody = Partial<YcrmLearningDraftInput> & {
  force_regenerate?: boolean;
};

export async function GET() {
  const sampleInput: YcrmLearningDraftInput = {
    session_id: "s-learning-sample",
    planner_preflight: {
      system: "ycrm",
      updatedAt: Date.now(),
      intent: "entity_summary",
      confidence: "high",
      shouldRouteToYcrm: true,
      workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
      needsWorkspaceValidation: false,
      warnings: [],
      blockers: [],
      crossSystem: false,
      targetSystems: [],
    },
    planner_context_pack: {
      planner: {
        system: "ycrm",
        updatedAt: Date.now(),
        intent: "entity_summary",
        confidence: "high",
        shouldRouteToYcrm: true,
        workspaceId: "workspace_3joxkr9ofo5hlxjan164egffx",
        needsWorkspaceValidation: false,
        warnings: [],
        blockers: [],
        crossSystem: false,
        targetSystems: [],
      },
      presentation: {
        optional_chart_requested: false,
        chart_render_allowed: false,
        chart_guardrail_reason: null,
        max_chart_panels: 0,
      },
      read_first: ["skills/ycrm/SKILL.md", "schema/integration-profiles/ycrm.md"],
      references: ["skills/ycrm/reference/auto-schema-workspace_3joxkr9ofo5hlxjan164egffx.md"],
      wiki: ["wiki/entities/customers/YCRM_CUSTOMER_SUMMARY_TEMPLATE.md"],
      playbooks: [],
      memory_keys: ["known_rule:person_name_is_not_workspace"],
      live_query_steps: ["read_real_data", "read_auto_schema_first", "resolve_workspace_member_fk"],
      execution_hints: ["Resolve workspaceMember IDs before owner lookups."],
    },
    messages: [
      {
        id: "m-user",
        role: "user",
        content: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
      },
      {
        id: "m-assistant",
        role: "assistant",
        content: "已整理出該業務目前負責的客戶輪廓、商機狀態與後續待跟進事項。",
      },
    ],
  };
  const sampleOutput = buildYcrmLearningDraft(sampleInput);

  return Response.json({
    ok: true,
    description: "Debug route for the Y-CRM learning-loop draft prototype.",
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
    sample_output: sampleOutput,
  });
}

export async function POST(req: Request) {
  let body: DebugRequestBody;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body.session_id || typeof body.session_id !== "string" || body.session_id.trim().length === 0) {
    return Response.json(
      { error: "Missing 'session_id' field in request body" },
      { status: 400 },
    );
  }

  if (body.force_regenerate !== true) {
    const existing = getSessionMeta(body.session_id)?.plannerLearningDraft;
    if (existing) {
      return Response.json({
        ok: true,
        cached: true,
        input: {
          session_id: body.session_id,
        },
        draft: markYcrmLearningDraftAsCached(existing),
      });
    }
  }

  const input: YcrmLearningDraftInput = {
    session_id: body.session_id,
    planner_preflight: body.planner_preflight ?? null,
    planner_context_pack: body.planner_context_pack ?? null,
    messages: Array.isArray(body.messages) ? body.messages : [],
  };
  const draft = buildYcrmLearningDraft(input);
  updateSessionPlannerLearningDraft(input.session_id, draft);

  return Response.json({
    ok: true,
    input,
    draft,
  });
}
