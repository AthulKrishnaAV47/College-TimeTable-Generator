import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/supabase";
import { ApiError, checkOrigin, errorResponse, readJson } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try { const { db } = await requireUser(); const { data, error } = await db.from("course_aliases").select("alias,course_code").limit(5000); if (error) throw error; return NextResponse.json({ aliases: data }); }
  catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req); const { db } = await requireUser(); const { data: admin } = await db.rpc("is_admin");
    if (!admin) throw new ApiError(403, "Administrator access required.");
    const body = z.object({ alias: z.string().trim().min(1).max(80).transform(s => s.toUpperCase()), course_code: z.string().trim().min(1).max(80).transform(s => s.toUpperCase()) }).parse(await readJson(req, 4096));
    const { error } = await db.from("course_aliases").upsert(body); if (error) throw error; return NextResponse.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
