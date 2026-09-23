import { NextRequest, NextResponse } from "next/server";
import { extractText, extractTextItems, getDocumentProxy } from "unpdf";
import { parseSlotSheet } from "@/lib/parse/slotSheet";
import { parseEligibilityTable } from "@/lib/parse/eligibility";
import { itemsToText, type PdfTextItem } from "@/lib/pdfLayout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side file parsing (§5 — PDF text extraction happens on Node, not in
 * the browser). Accepts multipart/form-data:
 *   kind: "slotSheet" | "eligibility"
 *   file: PDF (text extracted here) or .txt/.csv (read as text)
 * or application/json: { kind, text } for pasted text.
 *
 * PDFs are extracted with a layout-aware reconstructor (pdfLayout.ts): the
 * slot sheet is multi-column, and naive extraction glues neighbouring
 * columns' fragments onto each section's day lines, inventing class hours.
 * If item coordinates are unavailable we fall back to plain text extraction.
 *
 * Returns the raw extracted text plus the parsed result so the UI can show a
 * sanity-check preview before anything is used.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let kind = "slotSheet";
    let rawText = "";
    let extraction = "text";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      kind = String(form.get("kind") ?? "slotSheet");
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
      }
      const isPdf =
        file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
      if (isPdf) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pdf = await getDocumentProxy(bytes);
        if (kind === "eligibility") {
          const { text } = await extractText(pdf, { mergePages: true });
          rawText = text;
          extraction = "plain";
        } else {
          rawText = await extractLayoutAware(pdf);
          extraction = "layout-aware";
          if (!rawText.trim()) {
            // Fallback: naive extraction (no coordinates available)
            const { text } = await extractText(pdf, { mergePages: true });
            rawText = text;
            extraction = "plain";
          }
        }
      } else {
        rawText = await file.text();
      }
    } else {
      const body = await req.json();
      kind = String(body.kind ?? "slotSheet");
      rawText = String(body.text ?? "");
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "No text could be extracted from this file. If it is a scanned PDF, paste the text instead." },
        { status: 422 }
      );
    }

    if (kind === "eligibility") {
      const parsed = parseEligibilityTable(rawText);
      return NextResponse.json({ kind, text: rawText, extraction, ...parsed });
    }
    const parsed = parseSlotSheet(rawText);
    return NextResponse.json({ kind, text: rawText, extraction, ...parsed });
  } catch (err) {
    console.error("parse error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse the file." },
      { status: 500 }
    );
  }
}

/** Layout-aware extraction: per-page items → column-major text. */
async function extractLayoutAware(pdf: NonNullable<Awaited<ReturnType<typeof getDocumentProxy>>>): Promise<string> {
  try {
    const { items } = await extractTextItems(pdf);
    const pages = Array.isArray(items) ? (items as PdfTextItem[][]) : [];
    const pageTexts = pages
      .map((pageItems) => itemsToText(pageItems ?? []))
      .filter((t) => t.trim().length > 0);
    return pageTexts.join("\n\n");
  } catch {
    return "";
  }
}
