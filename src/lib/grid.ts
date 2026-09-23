import type { Placement, TimeCell, Weekday } from "./types";
import { isPlaceholderCell, mergeCells, timeToMinutes } from "./time";
import { WEEKDAYS } from "./types";

/** Display columns: Monday–Saturday (Sunday never appears in the data). */
export const GRID_DAYS: Weekday[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export interface GridBlock {
  day: Weekday;
  startTime: string;
  endTime: string;
  courseCode: string;
  courseName: string;
  faculty: string;
  slotCode: string;
  batch: string;
  colorIndex: number;
}

export interface CourseMeta {
  courseCode: string;
  courseName: string;
  credits: number;
  faculty: string;
  slotCode: string;
  selfPaced: boolean;
}

/** Stable per-course hue assignment (sorted by course code). */
export function courseColorIndex(codes: string[]): Record<string, number> {
  const sorted = [...new Set(codes)].sort();
  const map: Record<string, number> = {};
  sorted.forEach((c, i) => (map[c] = i % PALETTE.length));
  return map;
}

export const PALETTE: { bg: string; border: string; text: string; soft: string }[] = [
  { bg: "#dbeafe", border: "#2563eb", text: "#1e3a8a", soft: "#eff6ff" }, // blue
  { bg: "#dcfce7", border: "#16a34a", text: "#14532d", soft: "#f0fdf4" }, // green
  { bg: "#fee2e2", border: "#dc2626", text: "#7f1d1d", soft: "#fef2f2" }, // red
  { bg: "#fef3c7", border: "#d97706", text: "#78350f", soft: "#fffbeb" }, // amber
  { bg: "#f3e8ff", border: "#9333ea", text: "#581c87", soft: "#faf5ff" }, // purple
  { bg: "#cffafe", border: "#0891b2", text: "#164e63", soft: "#ecfeff" }, // cyan
  { bg: "#fce7f3", border: "#db2777", text: "#831843", soft: "#fdf2f8" }, // pink
  { bg: "#e2e8f0", border: "#475569", text: "#1e293b", soft: "#f8fafc" }, // slate
  { bg: "#d9f99d", border: "#65a30d", text: "#365314", soft: "#f7fee7" }, // lime
  { bg: "#fed7aa", border: "#ea580c", text: "#7c2d12", soft: "#fff7ed" }, // orange
];

/** Build display blocks from chosen placements (contiguous cells merged). */
export function computeGridBlocks(
  placements: Record<string, Placement>,
  courseNames: Record<string, string>
): GridBlock[] {
  const colorIndex = courseColorIndex(Object.keys(placements));
  const blocks: GridBlock[] = [];
  for (const [code, placement] of Object.entries(placements)) {
    for (const section of placement.sections) {
      const real: TimeCell[] = section.weeklyCells.filter((c) => !isPlaceholderCell(c));
      for (const merged of mergeCells(real)) {
        blocks.push({
          day: merged.day,
          startTime: merged.startTime,
          endTime: merged.endTime,
          courseCode: code,
          courseName: courseNames[code] ?? code,
          faculty: section.faculty.join(", "),
          slotCode: section.slotCode,
          batch: section.batch,
          colorIndex: colorIndex[code] ?? 0,
        });
      }
    }
  }
  return blocks;
}

/** Derive the row range from actual parsed cells (never hardcode 08–17). */
export function gridRange(
  blocks: { startTime: string; endTime: string }[],
  fallback: { start: number; end: number } = { start: 8, end: 17 }
): { start: number; end: number } {
  if (blocks.length === 0) return fallback;
  let min = 24;
  let max = 0;
  for (const b of blocks) {
    min = Math.min(min, timeToMinutes(b.startTime) / 60);
    max = Math.max(max, timeToMinutes(b.endTime) / 60);
  }
  return {
    start: Math.max(0, Math.floor(min)),
    end: Math.min(24, Math.max(Math.ceil(max), Math.floor(min) + 1)),
  };
}

/** One-hour cells for the merged display blocks (for metrics/Ics reuse). */
export function blockCells(blocks: GridBlock[]): TimeCell[] {
  return blocks.map((b) => ({ day: b.day, startTime: b.startTime, endTime: b.endTime }));
}

export const ALL_WEEKDAYS = WEEKDAYS;
