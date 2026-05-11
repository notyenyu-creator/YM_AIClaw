import {
  buildErpContext,
  createDefaultErpContextInput,
  type ErpContextBuilderInput,
} from "@/lib/erp-context-builder";
import { buildErpContextPack } from "@/lib/erp-context-pack";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DebugRequestBody = {
  user_message?: string;
  current_system_hint?: "erp" | "ycrm" | "none" | null;
};

function mergeInput(body: DebugRequestBody): ErpContextBuilderInput {
  const base = createDefaultErpContextInput(body.user_message ?? "");

  return {
    request: {
      ...base.request,
      current_system_hint: body.current_system_hint ?? base.request.current_system_hint,
      user_message: body.user_message ?? base.request.user_message,
    },
  };
}

export async function GET() {
  const sampleInput = createDefaultErpContextInput("請幫我查 OOCHAIN 本月還沒出貨的訂單。");
  const planner = buildErpContext(sampleInput);
  const pack = buildErpContextPack(planner);

  return Response.json({
    ok: true,
    builder: {
      id: "erp_context_builder",
      scope: "erp_phase_1",
    },
    description: "Debug route for the ERP context builder prototype.",
    usage: {
      method: "POST",
      body: {
        user_message: "請幫我查 OOCHAIN 本月還沒出貨的訂單。",
        current_system_hint: "erp",
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
  const planner = buildErpContext(input);
  const pack = buildErpContextPack(planner);

  return Response.json({
    ok: true,
    input,
    planner,
    pack,
  });
}
