import type { GridBlock } from "./grid";
import { GRID_DAYS, PALETTE } from "./grid";
import { timeToMinutes } from "./time";

/**
 * Deterministic SVG renderer for the weekly timetable grid.
 * Used both for the downloadable PNG (§3.6) and as the layout reference.
 */

export interface SvgGridOptions {
  title: string;
  subtitle?: string;
  blocks: GridBlock[];
  startHour: number;
  endHour: number;
  footer?: string[];
  colWidth?: number;
  rowHeight?: number;
  scale?: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur.length === 0) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, "…");
  }
  return lines;
}

export function buildTimetableSvg(opts: SvgGridOptions): string {
  const colWidth = opts.colWidth ?? 200;
  const rowHeight = opts.rowHeight ?? 62;
  const labelWidth = 56;
  const headerH = 74;
  const footerH = opts.footer && opts.footer.length > 0 ? 26 + opts.footer.length * 18 : 14;
  const days = opts.blocks.some(b => b.day === "Sunday") ? [...GRID_DAYS, "Sunday" as const] : GRID_DAYS;
  const width = labelWidth + days.length * colWidth;
  const rows = Math.max(1, opts.endHour - opts.startHour);
  const height = headerH + rows * rowHeight + footerH;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Arial, Helvetica, sans-serif">`
  );
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`);

  // Title + subtitle
  parts.push(
    `<text x="16" y="30" font-size="20" font-weight="bold" fill="#0f172a">${escapeXml(opts.title)}</text>`
  );
  if (opts.subtitle) {
    parts.push(
      `<text x="16" y="52" font-size="13" fill="#475569">${escapeXml(opts.subtitle)}</text>`
    );
  }

  // Day headers
  parts.push(`<rect x="${labelWidth}" y="${headerH - 26}" width="${colWidth * days.length}" height="26" fill="#1e293b"/>`);
  days.forEach((d, i) => {
    parts.push(
      `<text x="${labelWidth + i * colWidth + colWidth / 2}" y="${headerH - 8}" font-size="13" font-weight="bold" fill="#ffffff" text-anchor="middle">${d.slice(0, 3)}</text>`
    );
  });
  // Hour labels
  for (let r = 0; r < rows; r++) {
    const y = headerH + r * rowHeight;
    parts.push(`<rect x="0" y="${y}" width="${width}" height="${rowHeight}" fill="${r % 2 === 0 ? "#f8fafc" : "#ffffff"}"/>`);
    parts.push(
      `<text x="${labelWidth - 8}" y="${y + rowHeight / 2 + 4}" font-size="11" fill="#64748b" text-anchor="end">${String(opts.startHour + r).padStart(2, "0")}:00</text>`
    );
  }
  // Grid lines
  for (let r = 0; r <= rows; r++) {
    const y = headerH + r * rowHeight;
    parts.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`);
  }
  days.forEach((_, i) => {
    const x = labelWidth + i * colWidth;
    parts.push(`<line x1="${x}" y1="${headerH - 26}" x2="${x}" y2="${headerH + rows * rowHeight}" stroke="#e2e8f0" stroke-width="1"/>`);
  });
  parts.push(`<line x1="${width}" y1="${headerH - 26}" x2="${width}" y2="${headerH + rows * rowHeight}" stroke="#e2e8f0" stroke-width="1"/>`);

  // Class blocks
  for (const b of opts.blocks) {
    const dayIdx = days.indexOf(b.day);
    if (dayIdx < 0) continue;
    const startMin = timeToMinutes(b.startTime);
    const endMin = timeToMinutes(b.endTime);
    const y = headerH + ((startMin / 60) - opts.startHour) * rowHeight;
    const h = Math.max(18, ((endMin - startMin) / 60) * rowHeight);
    const x = labelWidth + dayIdx * colWidth + 4;
    const w = colWidth - 8;
    const color = PALETTE[b.colorIndex % PALETTE.length];
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${color.bg}" stroke="${color.border}" stroke-width="1.5"/>`
    );
    const lines = [
      `${b.courseCode} · ${b.slotCode}`,
      ...wrapText(b.courseName, 26, 2),
      b.faculty,
    ].filter((t) => t && t.length > 0);
    let ty = y + 16;
    lines.forEach((t, i) => {
      if (ty > y + h - 4) return;
      const isTitle = i === 0;
      const isFaculty = i === lines.length - 1 && lines.length > 1;
      parts.push(
        `<text x="${x + 8}" y="${ty}" font-size="${isTitle ? 12 : 10.5}" font-weight="${isTitle ? "bold" : "normal"}" fill="${isFaculty ? color.border : color.text}">${escapeXml(t.length > 30 ? t.slice(0, 29) + "…" : t)}</text>`
      );
      ty += 14;
    });
  }

  // Footer
  if (opts.footer && opts.footer.length > 0) {
    const fy = headerH + rows * rowHeight + 26;
    opts.footer.forEach((t, i) => {
      parts.push(
        `<text x="16" y="${fy + i * 18}" font-size="12" fill="#334155">${escapeXml(t)}</text>`
      );
    });
  }

  parts.push("</svg>");
  return parts.join("\n");
}
