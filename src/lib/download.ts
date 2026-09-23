"use client";

/** Browser-side exports: PNG (rasterized SVG), ICS text download. */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadText(text: string, filename: string, mime = "text/plain"): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

function readSvgSize(svg: string): { width: number; height: number } {
  const w = svg.match(/width="(\d+(?:\.\d+)?)" /);
  const h = svg.match(/height="(\d+(?:\.\d+)?)" /);
  return {
    width: w ? parseFloat(w[1]) : 1200,
    height: h ? parseFloat(h[1]) : 800,
  };
}

export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const { width, height } = readSvgSize(svg);
  const img = new Image();
  img.decoding = "sync";
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to rasterize the timetable image."));
    img.src = svgUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encoding failed."))),
      "image/png"
    )
  );
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "timetable"
  );
}
