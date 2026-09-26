import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/supabase";
import { ApiError, checkOrigin, errorResponse, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";
import { datasetSchema } from "@/lib/validation";
import { parseSlotSheet } from "@/lib/parse/slotSheet";
import { parseEligibilityTable } from "@/lib/parse/eligibility";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const { db } = await requireUser();
    const id = new URL(req.url).searchParams.get("id");
    const query = id ? db.from("term_datasets").select("*").eq("id", z.string().uuid().parse(id)) : db.from("term_datasets").select("id,term_label,status,created_at").order("created_at", { ascending: false }).limit(100);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ datasets: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { db, user } = await requireUser();
    if (!user.email_confirmed_at) throw new ApiError(403, "Verify your email before sharing datasets.");
    await rateLimit(req, "datasets", user.id, 10);
    const body = await readJson(req, 3_000_000);
    if (body.action === "flag") {
      const { id, reason } = z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(1000) }).parse(body);
      const { error } = await db.from("dataset_flags").upsert({ dataset_id: id, user_id: user.id, reason });
      if (error) throw error;
      return NextResponse.json({ message: "Report sent to moderators." });
    }
    const parsed = datasetSchema.parse(body);
    const { data, error } = await db.from("term_datasets").insert({ term_label: parsed.termLabel, slot_sheet: parsed.slotSheet, eligibility: parsed.eligibility, uploaded_by: user.id }).select("id").single();
    if (error) throw error;
    return NextResponse.json({ id: data.id, message: "Submitted for moderator review. It will appear for everyone once approved." });
  } catch (e) { return errorResponse(e); }
}
export async function PATCH(req: Request) {
  try {
    checkOrigin(req);
    const { db } = await requireUser();
    const { data: admin } = await db.rpc("is_admin");
    if (!admin) throw new ApiError(403, "Administrator access required.");
    const body = await readJson(req, 3_000_000);
    const id = z.string().uuid().parse(body.id);
    let updates;
    if (body.action === "reparse") {
      const { data, error } = await db.from("term_datasets").select("*").eq("id", id).single();
      if (error) throw error;
      const parsed = datasetSchema.parse({ termLabel: data.term_label, slotSheet: { text: data.slot_sheet.text, ...parseSlotSheet(data.slot_sheet.text) }, eligibility: { text: data.eligibility.text, ...parseEligibilityTable(data.eligibility.text) } });
      updates = { slot_sheet: parsed.slotSheet, eligibility: parsed.eligibility, status: "pending" };
    } else if (body.action === "correct") {
      const parsed = datasetSchema.parse(body);
      updates = { term_label: parsed.termLabel, slot_sheet: parsed.slotSheet, eligibility: parsed.eligibility, status: "pending" };
    } else { updates = { status: z.enum(["pending", "published", "archived"]).parse(body.status) }; }
    const { error } = await db.from("term_datasets").update(updates).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
