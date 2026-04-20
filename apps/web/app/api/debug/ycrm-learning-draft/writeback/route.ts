import { getSessionMeta, updateSessionPlannerLearningDraft } from "@/app/api/web-sessions/shared";
import { applyYcrmLearningDraftWriteback } from "@/lib/ycrm-learning-draft";
import { writeYcrmLearningWikiDrafts } from "@/lib/ycrm-learning-writeback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WritebackBody = {
	session_id?: string;
	overwrite?: boolean;
};

export async function POST(req: Request) {
	let body: WritebackBody;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	if (!body.session_id || typeof body.session_id !== "string" || body.session_id.trim().length === 0) {
		return Response.json({ error: "Missing 'session_id' field in request body" }, { status: 400 });
	}

	const session = getSessionMeta(body.session_id);
	if (!session?.plannerLearningDraft) {
		return Response.json({ error: "No persisted planner learning draft found for this session" }, { status: 404 });
	}

	const result = writeYcrmLearningWikiDrafts(
		body.session_id,
		session.plannerLearningDraft,
		{ overwrite: body.overwrite === true },
	);
	const updatedDraft = applyYcrmLearningDraftWriteback(session.plannerLearningDraft, result);
	updateSessionPlannerLearningDraft(body.session_id, updatedDraft);

	return Response.json({
		ok: true,
		session_id: body.session_id,
		writeback: updatedDraft.writeback,
		draft: updatedDraft,
	});
}
