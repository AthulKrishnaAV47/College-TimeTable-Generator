import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/supabase";
import { ApiError, checkOrigin, errorResponse, readJson } from "@/lib/server/http";
import { workspaceSchema } from "@/lib/validation";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const { db, user } = await requireUser();
    if (req.headers.get("x-workspace-owner") !== user.id) throw new ApiError(403, "Account changed. Reload before saving.");
    const { data, error } = await db.rpc("load_workspace");
    if (error) throw error;
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return errorResponse(e); }
}
export async function PUT(req: Request) {
  try {
    checkOrigin(req);
    const { db, user } = await requireUser();
    if (req.headers.get("x-workspace-owner") !== user.id) throw new ApiError(403, "Account changed. Reload before saving.");
    const { state, drafts, revision } = workspaceSchema.parse(await readJson(req, 4_000_000));
    const { data, error } = await db.rpc("save_workspace", { p_state: state, p_drafts: drafts, p_revision: revision });
    if (error?.code === "40001") throw new ApiError(409, "This workspace changed in another tab/device. Export your unsaved work, then reload before editing.");
    if (error) throw error;
    return NextResponse.json({ revision: data });
  } catch (e) { return errorResponse(e); }
}
