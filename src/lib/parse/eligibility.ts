import type { EligibilityParseResult, EligibilityRow, EligibilityType, EligibilityYear } from "../types";

/**
 * Parser for File B — the SBC/FC eligibility table (PDF/Excel export).
 *
 * Real sample rows:
 *   19AI301     | SBC       | I
 *   19CS305     | FC        | II & III
 *
 * Tolerates pipe-separated, tab-separated, multi-space-separated and plain
 * space-separated layouts, plus CSV. Header rows are skipped.
 */

const YEAR_II_III_RE = /^ii\s*(&|and)\s*iii$/i;
const YEAR_I_RE = /^i$/i;

function normalizeYear(raw: string): EligibilityYear | null {
  const s = raw.trim().replace(/\s+/g, " ");
  if (YEAR_II_III_RE.test(s.replace(/\s*&\s*/, " & "))) return "II & III";
  if (YEAR_II_III_RE.test(s.replace(/\s+and\s+/i, " & "))) return "II & III";
  if (YEAR_I_RE.test(s)) return "I";
  return null;
}

function normalizeType(raw: string): EligibilityType | null {
  const s = raw.trim().toUpperCase();
  if (s === "SBC") return "SBC";
  if (s === "FC") return "FC";
  return null;
}

function cleanPart(p: string): string {
  return p.trim().replace(/^"(.*)"$/, "$1").trim();
}

function parseRow(parts: string[]): EligibilityRow | null {
  const nonEmpty = parts.map(cleanPart).filter((p) => p.length > 0);
  if (nonEmpty.length < 3) return null;
  const [code, type, ...yearParts] = nonEmpty;
  const t = normalizeType(type);
  if (!t) return null;
  const year = normalizeYear(yearParts.join(" "));
  if (!year) return null;
  return { courseCode: code.toUpperCase(), type: t, year };
}

export function parseEligibilityTable(text: string): EligibilityParseResult {
  const warnings: string[] = [];
  const rows: EligibilityRow[] = [];

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\u00a0/g, " ").trim();
    if (!line) continue;

    // Skip obvious header rows
    if (/course\s*code/i.test(line) && /(sbc|fc)/i.test(line)) continue;
    if (/^sbc\s*(or|\/)\s*fc/i.test(line)) continue;

    let parts: string[] | null = null;
    if (line.includes("|")) {
      parts = line.split("|");
    } else if (line.includes("\t")) {
      parts = line.split("\t");
    } else if (line.includes(",")) {
      parts = line.split(",");
    } else if (/\s{2,}/.test(line)) {
      parts = line.split(/\s{2,}/);
    } else {
      parts = null;
    }

    let row: EligibilityRow | null = null;
    if (parts) {
      row = parseRow(parts);
    }
    if (!row) {
      // Fallback: "19AI301 SBC II & III" (single-space separated)
      const m = line.match(/^(\S+)\s+(SBC|FC)\s+(.+)$/i);
      if (m) {
        row = parseRow([m[1], m[2], m[3]]);
      }
    }

    if (row) {
      rows.push(row);
    } else {
      warnings.push(`Line ${i + 1} not recognized as an eligibility row: "${line.slice(0, 60)}" — skipped.`);
    }
  }

  // Report preserved duplicates (same code, different year levels) — spec §2.2
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.courseCode, (counts.get(r.courseCode) ?? 0) + 1);
  for (const [code, n] of counts) {
    if (n > 1) {
      warnings.push(`Course ${code} has ${n} eligibility rows (offered at multiple year levels) — all preserved.`);
    }
  }

  return { rows, warnings };
}
