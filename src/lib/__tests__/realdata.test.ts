import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSlotSheet } from "@/lib/parse/slotSheet";
import { solve } from "@/lib/solver";
import type { CoursePreferences } from "@/lib/types";

/**
 * Reproduction of a real user report (Jul–Sep 2026 term): 19AI305 + 19AI541
 * + 19AI413 + 19CS405 — the app reported "no valid timetable" although the
 * student knew one existed. Root cause: the two-column PDF's text layer let
 * neighbouring sections' blocks bleed into each section's day lines
 * (e.g. 19AI541 T1-R17 showed Monday 10:00–17:00: its own 10:00–12:00 plus
 * T1-X10's 13:00–15:00 and T1-D8's 15:00–17:00), creating fake conflicts.
 *
 * The garbled fixture is what the naive extraction produced; the clean
 * fixture is what the column-aware extractor yields for the same sheet.
 */

const GARBLED = readFileSync(join(__dirname, "fixtures", "realtimetable.txt"), "utf8");
const CLEAN = readFileSync(join(__dirname, "fixtures", "realtimetable-clean.txt"), "utf8");

const prefs = (courses: { courseCode: string }[]): Record<string, CoursePreferences> =>
  Object.fromEntries(
    courses.map((c) => [c.courseCode, { sectionMode: "alternative" as const, preferredFaculty: null }])
  );

describe("real user report — two-column slot sheet", () => {
  it("parses all four courses from the garbled extraction", () => {
    const { courses } = parseSlotSheet(GARBLED);
    expect(courses.map((c) => c.courseCode)).toEqual([
      "19AI305",
      "19AI541",
      "19AI413",
      "19CS405",
    ]);
    const counts = Object.fromEntries(courses.map((c) => [c.courseCode, c.sections.length]));
    expect(counts).toEqual({ "19AI305": 10, "19AI541": 4, "19AI413": 3, "19CS405": 9 });
  });

  it("removes duplicated time cells and warns about the artifact", () => {
    const { courses, warnings } = parseSlotSheet(GARBLED);
    const cloud = courses.find((c) => c.courseCode === "19AI541")!;
    const r17 = cloud.sections.find((s) => s.slotCode === "T1-R17")!;
    const keys = r17.weeklyCells.map((c) => `${c.day}|${c.startTime}|${c.endTime}`);
    expect(new Set(keys).size).toBe(keys.length); // no duplicates survive
    expect(warnings.some((w) => w.includes("T1-R17") && w.includes("duplicate time cell"))).toBe(
      true
    );
  });

  it("GARBLED data: fails, but names the exact clashing blocks (near-misses)", () => {
    const { courses } = parseSlotSheet(GARBLED);
    const r = solve(courses, prefs(courses), { rankBy: "fewest-gaps" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // No single pair explains it — the failure must show closest schedules.
      expect(r.nearMisses.length).toBeGreaterThan(0);
      const best = r.nearMisses[0];
      expect(best.conflictHours).toBeLessThanOrEqual(2);
      expect(best.clashes.length).toBeGreaterThan(0);
      const windows = best.clashes.flatMap((c) => c.windows);
      expect(windows.some((w) => w.length > 0)).toBe(true);
      expect(r.message).toMatch(/No conflict-free timetable exists/);
    }
  });

  it("CLEAN data (column-aware extraction): finds the valid timetables", () => {
    const { courses, warnings } = parseSlotSheet(CLEAN);
    const cloud = courses.find((c) => c.courseCode === "19AI541")!;
    const r17 = cloud.sections.find((s) => s.slotCode === "T1-R17")!;
    // The bleed artifacts are gone: Monday is the real 10:00–12:00 block only.
    expect(r17.weeklyCells.filter((c) => c.day === "Monday")).toHaveLength(2);
    expect(r17.weeklyHours).toBe(8); // 4 days × 2h
    expect(warnings.some((w) => w.includes("duplicate time cell"))).toBe(false);

    const r = solve(courses, prefs(courses), { rankBy: "fewest-gaps" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.solutions.length).toBeGreaterThan(0);
      // sanity: zero overlaps in the best solution
      const all = Object.values(r.solutions[0].placements).flatMap((p) => p.busy);
      expect(all.length).toBeGreaterThan(0);
    }
  });
});
