/**
 * Layout-aware PDF text reconstruction for the MyCamu slot sheet.
 *
 * The slot-sheet PDF is multi-column: several course/section blocks sit
 * side-by-side. Naive text extraction concatenates items in visual-line
 * order, so a fragment from the neighbouring column gets glued onto a
 * section's day line ("Monday: 10:00 - 11:0011:00 - 12:00" + the neighbour's
 * "13:00 - 14:0014:00 - 15:00") — inventing class hours that then create
 * fake conflicts in the solver.
 *
 * This module rebuilds the text COLUMN-MAJOR using the text items' x/y
 * coordinates: items are grouped into visual lines, split into column bands
 * at large x-gaps, band starts are clustered into column edges, and each
 * column is serialized top-to-bottom independently. The output feeds the
 * exact same regex parser as pasted text.
 */

export interface PdfTextItem {
  str: string;
  x?: number;
  y?: number;
  width?: number;
}

/** Vertical tolerance (pt) for "same visual line". */
const LINE_TOLERANCE = 3;
/** Horizontal gap (pt) that starts a new column band within a line. */
const COLUMN_GAP = 36;
/** Tolerance (pt) when clustering column left edges. */
const COLUMN_CLUSTER_TOLERANCE = 30;

interface Point {
  x: number;
  y: number;
  str: string;
  width: number;
}

interface Line {
  y: number;
  items: Point[];
}

function toPoints(items: PdfTextItem[]): Point[] {
  const pts: Point[] = [];
  for (const it of items) {
    if (typeof it.x !== "number" || typeof it.y !== "number") return []; // no coordinates → unusable
    if (!it.str || !it.str.trim()) continue;
    pts.push({ x: it.x, y: it.y, str: it.str, width: it.width ?? 0 });
  }
  return pts;
}

/** Group items into visual lines (y descending = top of page first). */
function groupLines(pts: Point[]): Line[] {
  const sorted = [...pts].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const p of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - p.y) <= LINE_TOLERANCE) {
      last.items.push(p);
    } else {
      lines.push({ y: p.y, items: [p] });
    }
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

/** Split a visual line into column bands at large x-gaps. */
function splitBands(line: Line): Point[][] {
  const bands: Point[][] = [];
  let current: Point[] = [];
  for (const item of line.items) {
    if (current.length === 0) {
      current.push(item);
      continue;
    }
    const prev = current[current.length - 1];
    const gap = item.x - (prev.x + prev.width);
    if (gap > COLUMN_GAP) {
      bands.push(current);
      current = [item];
    } else {
      current.push(item);
    }
  }
  if (current.length > 0) bands.push(current);
  return bands;
}

/**
 * Rebuild layout-aware text from pdf.js text items (one page's worth per
 * call, or all pages concatenated — pages are serialized separately by the
 * caller when possible).
 */
export function itemsToText(items: PdfTextItem[]): string {
  const pts = toPoints(items);
  if (pts.length === 0) return "";

  const lines = groupLines(pts);

  // Candidate column left edges: the first item of EVERY band on every line
  // (course headers always start a column, and so does each band split).
  const candidates: number[] = [];
  for (const line of lines) {
    for (const band of splitBands(line)) {
      candidates.push(band[0].x);
    }
  }
  candidates.sort((a, b) => a - b);
  const edges: number[] = [];
  for (const x of candidates) {
    if (edges.length === 0 || x - edges[edges.length - 1] > COLUMN_CLUSTER_TOLERANCE) {
      edges.push(x);
    }
  }

  // Assign every item to a column: the nearest edge at or left of it.
  const columns: Point[][] = edges.map(() => []);
  for (const p of pts) {
    let col = 0;
    for (let i = 0; i < edges.length; i++) {
      if (edges[i] <= p.x + 2) col = i;
      else break;
    }
    columns[col].push(p);
  }

  // Serialize each column independently, top-to-bottom.
  const chunks: string[] = [];
  for (const col of columns) {
    if (col.length === 0) continue;
    const colLines = groupLines(col);
    chunks.push(
      colLines
        .sort((a, b) => b.y - a.y)
        .map((l) => l.items.map((p) => p.str.trim()).filter(Boolean).join(" "))
        .filter((s) => s.length > 0)
        .join("\n")
    );
  }
  return chunks.join("\n\n");
}
