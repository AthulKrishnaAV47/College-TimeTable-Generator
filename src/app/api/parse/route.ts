import { NextResponse } from "next/server";
import { parseSlotSheet } from "@/lib/parse/slotSheet";
import { parseEligibilityTable } from "@/lib/parse/eligibility";
import { requireUser } from "@/lib/server/supabase";
import { ApiError, checkOrigin, errorResponse, readBody, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rateLimit";
import { extractPdf } from "@/lib/server/pdf";
import { validateUpload } from "@/lib/uploads";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const { user } = await requireUser();
    await rateLimit(req, "parse", user.id, 20);
    const contentType = req.headers.get("content-type") ?? "";
    let kind: "slotSheet" | "eligibility", text: string, extraction = "text";
    const kindSchema = z.enum(["slotSheet", "eligibility"]);
    if (contentType.includes("multipart/form-data")) {
      // Count bytes while streaming; Content-Length alone is attacker-controlled.
      const bytes = await readBody(req, 3_100_000);
      const form = await new Response(bytes as BodyInit, { headers: { "Content-Type": contentType } }).formData();
      kind = kindSchema.parse(form.get("kind"));
      const file = form.get("file");
      if (!(file instanceof File)) throw new ApiError(400, "No file uploaded.");
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      let format;
      try { format = validateUpload(file.name, file.type, fileBytes); }
      catch (e) { throw new ApiError(400, (e as Error).message); }
      if (format === "pdf") { text = await extractPdf(fileBytes, kind); extraction = kind === "slotSheet" ? "layout-aware" : "plain"; }
      else text = new TextDecoder("utf-8", { fatal: true }).decode(fileBytes);
    } else if (contentType.includes("application/json")) {
      const body = z.object({ kind: kindSchema, text: z.string().max(1_000_000) }).parse(await readJson(req, 1_100_000));
      kind = body.kind; text = body.text;
    } else throw new ApiError(415, "Use a file upload or JSON text.");
    if (!text.trim()) throw new ApiError(422, "No text could be extracted. Scanned PDFs are unsupported; paste exported text instead.");
    if (text.length > 1_000_000) throw new ApiError(413, "Extracted text is too large.");
    const parsed = kind === "eligibility" ? parseEligibilityTable(text) : parseSlotSheet(text);
    return NextResponse.json({ kind, text, extraction, ...parsed });
  } catch (e) { return errorResponse(e); }
}
