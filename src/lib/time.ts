import type { TimeCell, Weekday } from "./types";

/** "HH:MM" → minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  return h * 60 + (m || 0);
}

/** minutes since midnight → "HH:MM" (zero-padded, wraps past midnight). */
export function minutesToTime(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function cellDurationMinutes(cell: TimeCell): number {
  const d = timeToMinutes(cell.endTime) - timeToMinutes(cell.startTime);
  return d >= 0 ? d : d + 24 * 60;
}

/**
 * Cells shorter than this are considered administrative placeholders
 * (e.g. "Wednesday: 17:04 - 17:05" on self-paced courses). They are
 * accepted by the parser but excluded from conflict checks and the grid.
 */
export const PLACEHOLDER_MAX_MINUTES = 15;

export function isPlaceholderCell(cell: TimeCell): boolean {
  const d = cellDurationMinutes(cell);
  return d > 0 && d < PLACEHOLDER_MAX_MINUTES;
}

/** Stable key for conflict maps. */
export function cellKey(cell: TimeCell): string {
  return `${cell.day}|${cell.startTime}|${cell.endTime}`;
}

export function cellsOverlap(a: TimeCell, b: TimeCell): boolean {
  return rangesOverlap(a.startTime, a.endTime, b.startTime, b.endTime) && a.day === b.day;
}

/** Pure interval overlap (ignores the day). */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

/** Merge contiguous/adjacent cells (same day) into blocks for display. */
export function mergeCells(cells: TimeCell[]): TimeCell[] {
  const byDay = new Map<Weekday, TimeCell[]>();
  for (const c of cells) {
    if (!byDay.has(c.day)) byDay.set(c.day, []);
    byDay.get(c.day)!.push(c);
  }
  const merged: TimeCell[] = [];
  for (const day of byDay.keys()) {
    const dayCells = [...byDay.get(day)!].sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    );
    let cur: TimeCell | null = null;
    for (const c of dayCells) {
      if (cur && timeToMinutes(cur.endTime) === timeToMinutes(c.startTime)) {
        cur = { day, startTime: cur.startTime, endTime: c.endTime };
      } else {
        if (cur) merged.push(cur);
        cur = { ...c };
      }
    }
    if (cur) merged.push(cur);
  }
  return merged;
}

/** "DD-MM-YYYY" → "YYYY-MM-DD" (ISO). Returns input unchanged if not matching. */
export function ddmmyyyyToIso(s: string): string {
  const m = s.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return s.trim();
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Weekday of an ISO "YYYY-MM-DD" string (UTC-safe). */
export function weekdayOf(isoDate: string): Weekday {
  const [y, m, d] = isoDate.split("-").map((n) => parseInt(n, 10));
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sunday
  const names: Weekday[] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return names[js];
}

/** First ISO date on/after `startIso` whose weekday matches. */
export function firstOccurrence(startIso: string, day: Weekday): string {
  const names: Weekday[] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const [y, m, d] = startIso.split("-").map((n) => parseInt(n, 10));
  const base = new Date(Date.UTC(y, m - 1, d));
  const target = names.indexOf(day);
  if (target < 0) return startIso;
  const delta = (target - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}

/** Add `n` days to an ISO date string. */
export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map((n2) => parseInt(n2, 10));
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + n);
  return base.toISOString().slice(0, 10);
}
