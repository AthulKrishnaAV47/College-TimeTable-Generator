import { describe, expect, it } from "vitest";
import { resolveCourseCode, assertEligiblePool } from "../courseCodes";
import { buildEligibility } from "../eligibility";
import { findAlternativeCourseAction } from "@/app/actions";
import { autoSelectCourses } from "../solver";
import type { Course, EligibilityRow } from "../types";
const course = (courseCode: string, courseName: string): Course => ({
  courseCode, courseName, credits: 4, category: "", sectionMode: "alternative",
  sections: [{ batch: "A", slotCode: "T1", department: "AI", faculty: [], startDate: "2026-01-01", endDate: "2026-04-01", selfPaced: false, weeklyHours: 1,
    weeklyCells: [{ day: "Monday", startTime: "09:00", endTime: "10:00" }] }],
});
const courses = [course("19AI303", "Engineering Mechanics and Product Development"), course("19CS301", "Algorithms"), course("19CS302", "Databases")];

describe("completed course exclusion", () => {
  it("resolves EMPD, codes, names, whitespace and curated aliases without guessing", () => {
    for (const input of [" empd ", "19ai303", "19 AI 303", courses[0].courseName]) expect(resolveCourseCode(input, courses)).toBe("19AI303");
    expect(resolveCourseCode("EMDP", courses)).toBeNull();
    expect(resolveCourseCode("EMPD", [...courses, course("OTHER", courses[0].courseName)])).toBeNull();
  });
  for (const year of ["I", "II & III"] as const) for (const type of ["SBC", "FC"] as const) {
    it(`excludes completed aliases in ${year}/${type}, including every retry pool`, () => {
      const rows: EligibilityRow[] = courses.flatMap(c => [
        { courseCode: c.courseCode.toLowerCase(), year: "I", type }, { courseCode: c.courseCode, year: "II & III", type },
      ]);
      const summary = buildEligibility(courses, rows, { year, termLabel: "Term 2", completedCourseCodes: ["EMPD"] });
      const eligible = [...summary.sbc, ...summary.fc];
      expect(eligible.map(c => c.courseCode)).not.toContain("19AI303");
      const pools: string[][] = [];
      const result = autoSelectCourses(eligible, {}, { targetCount: 2, completedCourseCodes: ["19AI303"], onCandidatePool: p => pools.push(p) });
      expect(pools.length).toBeGreaterThan(1); // conflicting pair forces drop/retry
      for (const pool of pools) {
        expect(pool).not.toContain("19AI303");
        expect(pool.every(code => eligible.some(c => c.courseCode === code))).toBe(true);
      }
      expect(result.ok).toBe(true);
      expect(result.chosen.map(c => c.courseCode)).not.toContain("19AI303");
    });
  }
  it("replacement suggestions cannot reintroduce EMPD from the wider offered list", async () => {
    const offered = [...courses, course("19CS303", "Networks")];
    const summary = buildEligibility(offered, offered.map(c => ({ courseCode: c.courseCode, year: "I", type: "FC" })), { year: "I", termLabel: "Term", completedCourseCodes: ["EMPD"] });
    const result = await findAlternativeCourseAction(courses.slice(1), [...summary.sbc, ...summary.fc], {
      placements: {}, conflictHours: 1, clashes: [{ courseA: "19CS301", courseB: "19CS302", sectionA: "T1", sectionB: "T1", windows: ["Monday 09:00–10:00"] }],
    });
    expect(result.result.addCourse).toBe("19CS303");
    expect(result.result.addCourse).not.toBe("19AI303");
  });
  it("fails loudly if a completed or outside course enters a candidate pool", () => {
    expect(() => assertEligiblePool(courses, courses.slice(1))).toThrow("Unsafe solver candidate");
    expect(() => autoSelectCourses(courses, {}, { completedCourseCodes: ["EMPD"] })).toThrow("Unsafe solver candidate");
  });
});
