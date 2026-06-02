import { collectDomainParityAudit } from "@/lib/domain-parity-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    audit: collectDomainParityAudit(),
  });
}
