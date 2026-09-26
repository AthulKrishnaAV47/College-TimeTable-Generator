import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
import { extractPdf } from "../server/pdf";
// Minimal real PDF built at runtime; no large binary fixture committed.
function pdf(text: string) {
  const stream = `BT /F1 12 Tf 40 150 Td (${text}) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let data = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((o, i) => { offsets.push(data.length); data += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = data.length; data += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(data);
}
describe("isolated PDF parser", () => {
  it("extracts a real PDF in a child process", async () => {
    expect(await extractPdf(pdf("19AI303 FC I"), "eligibility")).toContain("19AI303");
    expect(await extractPdf(pdf("19AI303 FC I"), "slotSheet")).toContain("19AI303");
  }, 30_000);
  it("returns a clean error for malformed PDF bytes", async () => {
    await expect(extractPdf(new TextEncoder().encode("%PDF-broken"), "slotSheet")).rejects.toThrow("Couldn’t parse");
  }, 30_000);
});
