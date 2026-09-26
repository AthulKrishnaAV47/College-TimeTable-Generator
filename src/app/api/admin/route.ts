import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/supabase";
import { ApiError, errorResponse } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { db } = await requireUser(); const { data: admin } = await db.rpc("is_admin");
    if (!admin) throw new ApiError(403, "Administrator access required.");
    const [stats, flags, deletions] = await Promise.all([db.rpc("admin_stats"), db.from("dataset_flags").select("*").order("created_at", { ascending: false }).limit(100), db.from("deletion_requests").select("*").order("created_at").limit(100)]);
    if (stats.error || flags.error || deletions.error) throw stats.error ?? flags.error ?? deletions.error;
    return NextResponse.json({ stats: stats.data, flags: flags.data, deletions: deletions.data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return errorResponse(e); }
}
