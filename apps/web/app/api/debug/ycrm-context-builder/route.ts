import {
  buildYcrmContext,
  createDefaultYcrmContextInput,
  type YcrmContextBuilderInput,
} from "@/lib/ycrm-context-builder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DebugRequestBody = {
  user_message?: string;
  current_system_hint?: string | null;
  requested_workspace?: string | null;
  user_locale?: string | null;
  runtime_state?: Partial<YcrmContextBuilderInput["runtime_state"]>;
  defaults?: Partial<YcrmContextBuilderInput["defaults"]>;
};

function mergeInput(body: DebugRequestBody): YcrmContextBuilderInput {
  const base = createDefaultYcrmContextInput(body.user_message ?? "");

  return {
    request: {
      ...base.request,
      current_system_hint: body.current_system_hint ?? base.request.current_system_hint,
      requested_workspace: body.requested_workspace ?? base.request.requested_workspace,
      user_locale: body.user_locale ?? base.request.user_locale,
      user_message: body.user_message ?? base.request.user_message,
    },
    runtime_state: {
      available_wiki_pages: body.runtime_state?.available_wiki_pages ?? base.runtime_state.available_wiki_pages,
      available_playbooks: body.runtime_state?.available_playbooks ?? base.runtime_state.available_playbooks,
      known_memory_keys: body.runtime_state?.known_memory_keys ?? base.runtime_state.known_memory_keys,
      available_auto_schema_workspaces:
        body.runtime_state?.available_auto_schema_workspaces ?? base.runtime_state.available_auto_schema_workspaces,
    },
    defaults: {
      default_workspace_id: body.defaults?.default_workspace_id ?? base.defaults.default_workspace_id,
    },
  };
}

export async function GET() {
  const sampleInput = createDefaultYcrmContextInput("Y-CRM 的 LINE 自動回覆要怎麼設定？");
  const sampleOutput = buildYcrmContext(sampleInput);

  return Response.json({
    ok: true,
    builder: sampleOutput.builder,
    description: "Debug route for the Y-CRM context builder prototype.",
    usage: {
      method: "POST",
      body: {
        user_message: "請幫我整理 Y-CRM 工作區裡面的 Calleen Hong 目前負責的客戶背景。",
        current_system_hint: "ycrm",
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

  if (!body.user_message || typeof body.user_message !== "string" || body.user_message.trim().length === 0) {
    return Response.json(
      { error: "Missing 'user_message' field in request body" },
      { status: 400 },
    );
  }

  const input = mergeInput(body);
  const plan = buildYcrmContext(input);

  return Response.json({
    ok: true,
    input,
    plan,
  });
}
