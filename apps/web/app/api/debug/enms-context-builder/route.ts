import {
  buildEnmsContext,
  createDefaultEnmsContextInput,
  type EnmsContextBuilderInput,
} from "@/lib/enms-context-builder";
import { buildEnmsContextPack } from "@/lib/enms-context-pack";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DebugRequestBody = {
  user_message?: string;
  current_system_hint?: "enms" | "erp" | "ycrm" | "none" | null;
};

function mergeInput(body: DebugRequestBody): EnmsContextBuilderInput {
  const base = createDefaultEnmsContextInput(body.user_message ?? "");

  return {
    request: {
      ...base.request,
      current_system_hint:
        body.current_system_hint ?? base.request.current_system_hint,
      user_message: body.user_message ?? base.request.user_message,
    },
  };
}

export async function GET() {
  const sampleInput = createDefaultEnmsContextInput(
    "請幫我分析這個場域的需量預測與降載建議。",
  );
  const planner = buildEnmsContext(sampleInput);
  const pack = buildEnmsContextPack(planner);

  return Response.json({
    ok: true,
    builder: {
      id: "enms_context_builder",
      scope: "enms_runtime",
    },
    description: "Debug route for the EnMS context builder prototype.",
    usage: {
      method: "POST",
      body: {
        user_message: "請幫我分析這個場域的需量預測與降載建議。",
        current_system_hint: "enms",
      },
    },
    defaults: sampleInput,
    sample_output: {
      planner,
      pack,
    },
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
    !body.user_message ||
    typeof body.user_message !== "string" ||
    body.user_message.trim().length === 0
  ) {
    return Response.json(
      { error: "Missing 'user_message' field in request body" },
      { status: 400 },
    );
  }

  const input = mergeInput(body);
  const planner = buildEnmsContext(input);
  const pack = buildEnmsContextPack(planner);

  return Response.json({
    ok: true,
    input,
    planner,
    pack,
  });
}
