import { describe, expect, it } from "vitest";
import {
  autoSelectCourses,
  buildPlacements,
  placementSignature,
  solve,
  solveWithFallback,
} from "../solver";
import { requiredCourseCodes } from "../requirements";
import { buildReadiness } from "../readiness";
import { buildEligibility } from "../eligibility";
import { findAlternativeCourseAction } from "@/app/actions";
import { DEFAULT_STATE } from "../appState";
import { workspaceSchema } from "../validation";
import type { CoursePreferences, EligibleSubject, Section } from "../types";

const section = (
  slotCode: string,
  day: Section["weeklyCells"][number]["day"] = "Monday",
  start = "09:00",
): Section => ({
  slotCode,
  batch: "A",
  department: "AI",
  faculty: ["Teacher"],
  startDate: "2027-01-01",
  endDate: "2027-04-01",
  selfPaced: false,
  weeklyHours: 1,
  weeklyCells: [
    {
      day,
      startTime: start,
      endTime: `${String(Number(start.slice(0, 2)) + 1).padStart(2, "0")}:00`,
    },
  ],
});
const course = (
  courseCode: string,
  sections = [section("T1")],
  credits = 4,
  type: "FC" | "SBC" = "FC",
): EligibleSubject => ({
  courseCode,
  courseName: courseCode,
  credits,
  type,
  sections,
  category: "",
  sectionMode: "alternative",
});
const a = course("19AI303"),
  b = course("19CS301"),
  c = course("19CS302", [section("T2", "Tuesday")], 1);
const lock = (course: EligibleSubject): CoursePreferences => {
  const placement = buildPlacements(course, {
    sectionMode: course.sectionMode,
    preferredFaculty: null,
  })[0];
  return {
    sectionMode: course.sectionMode,
    preferredFaculty: null,
    lockedPlacementId: placement.id,
    lockedPlacementSignature: placementSignature(placement),
  };
};
function successful(
  courses: EligibleSubject[],
  prefs: Record<string, CoursePreferences> = {},
) {
  const result = solve(courses, prefs);
  if (!result.ok) throw new Error("test fixture is not schedulable");
  return result.solutions[0];
}

describe("non-negotiable course pins", () => {
  it("starts with pinned courses even when they have lower credit value", () => {
    const result = autoSelectCourses(
      [a, c],
      {},
      { targetCount: 1, pinnedCourseCodes: ["19cs302"] },
    );
    expect(result.ok).toBe(true);
    expect(result.chosen.map((c) => c.courseCode)).toEqual([c.courseCode]);
  });
  it("never drops a pin in any retry pool; it drops the conflicting unpinned course", () => {
    const pools: string[][] = [];
    const result = autoSelectCourses(
      [a, b],
      {},
      {
        targetCount: 2,
        pinnedCourseCodes: [a.courseCode],
        onCandidatePool: (codes) => pools.push(codes),
      },
    );
    expect(result.ok).toBe(true);
    expect(pools.length).toBeGreaterThan(1);
    expect(pools.every((pool) => pool.includes(a.courseCode))).toBe(true);
    expect(result.chosen.map((c) => c.courseCode)).toEqual([a.courseCode]);
  });
  it("reports blocking pairs when pins conflict rather than dropping either", () => {
    const result = autoSelectCourses(
      [a, b, c],
      {},
      { targetCount: 2, pinnedCourseCodes: [a.courseCode, b.courseCode] },
    );
    expect(result.ok).toBe(false);
    expect(result.failure?.blockingPairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          courseA: a.courseCode,
          courseB: b.courseCode,
        }),
      ]),
    );
    expect(
      result.attempts.every(
        (p) =>
          p.selected.includes(a.courseCode) &&
          p.selected.includes(b.courseCode),
      ),
    ).toBe(true);
  });
  it("fails visibly for completed/ineligible pins; completion exclusions win", () => {
    const summary = buildEligibility(
      [a, c],
      [a, c].map((c) => ({ courseCode: c.courseCode, type: "FC", year: "I" })),
      { year: "I", termLabel: "Term", completedCourseCodes: ["EMPD"] },
    );
    const result = autoSelectCourses(
      [...summary.fc, ...summary.sbc],
      {},
      {
        targetCount: 1,
        pinnedCourseCodes: [a.courseCode],
        completedCourseCodes: [a.courseCode],
      },
    );
    expect(result.ok).toBe(false);
    expect(result.attempts).toHaveLength(0);
    expect(result.failure?.message).toContain("Required courses unavailable");
    expect(
      solveWithFallback([c], {}, { pinnedCourseCodes: [a.courseCode] }).outcome,
    ).toBe("impossible");
  });
  it("counts pinned courses toward category minimums without double-picking", () => {
    const result = autoSelectCourses(
      [a, c],
      {},
      { pinnedCourseCodes: [a.courseCode], targetCount: 1, minFC: 1 },
    );
    expect(result.chosen.map((c) => c.courseCode)).toEqual([a.courseCode]);
  });
  it("does not drop pins when their count exceeds a planning target", () => {
    const result = autoSelectCourses(
      [a, c],
      {},
      { targetCount: 1, pinnedCourseCodes: [a.courseCode, c.courseCode] },
    );
    expect(result.ok).toBe(true);
    expect(result.chosen).toHaveLength(2);
  });
  it("replacement suggestions cannot remove pinned/locked courses", async () => {
    const nearMiss = {
      placements: {},
      conflictHours: 1,
      clashes: [
        {
          courseA: a.courseCode,
          courseB: b.courseCode,
          sectionA: "T1",
          sectionB: "T1",
          windows: ["Monday 09:00"],
        },
      ],
    };
    const allowed = await findAlternativeCourseAction(
      [a, b],
      [a, b, c],
      nearMiss,
      [a.courseCode],
    );
    expect(allowed.result.removeCourse).toBe(b.courseCode);
    const blocked = await findAlternativeCourseAction(
      [a, b],
      [a, b, c],
      nearMiss,
      [a.courseCode, b.courseCode],
    );
    expect(blocked.success).toBe(false);
    expect(blocked.result.removeCourse).toBe("");
  });
});

describe("hard section locks", () => {
  const alternatives = course("ALT", [section("T1"), section("T2", "Tuesday")]);
  it("restricts placement choices and refuses to use an unlocked alternative to resolve a clash", () => {
    expect(solve([alternatives, b], {}).ok).toBe(true);
    const prefs = { ALT: lock(alternatives) };
    expect(buildPlacements(alternatives, prefs.ALT)).toHaveLength(1);
    expect(solveWithFallback([alternatives, b], prefs).outcome).toBe(
      "impossible",
    );
  });
  it("implicitly includes a locked course in auto-selection, even with a zero-fitting lock", () => {
    expect(requiredCourseCodes([], { ALT: lock(alternatives) })).toEqual([
      "ALT",
    ]);
    const result = autoSelectCourses(
      [alternatives, c],
      { ALT: lock(alternatives) },
      { targetCount: 1 },
    );
    expect(result.chosen.map((c) => c.courseCode)).toEqual(["ALT"]);
    const blocked = autoSelectCourses(
      [alternatives, c],
      { ALT: lock(alternatives) },
      {
        targetCount: 2,
        constraints: { excludedDays: ["Monday"], excludedRanges: [] },
      },
    );
    expect(blocked.ok).toBe(false);
    expect(blocked.attempts.every((a) => a.selected.includes("ALT"))).toBe(
      true,
    );
  });
  it("relaxes no-class rules, never the section lock", () => {
    const prefs = { ALT: lock(alternatives) };
    const result = solveWithFallback([alternatives], prefs, {
      constraints: { excludedDays: ["Monday", "Tuesday"], excludedRanges: [] },
    });
    expect(result.outcome).toBe("relaxed");
    expect(result.solutions.every((s) => s.assignment.ALT === "ALT::T1")).toBe(
      true,
    );
  });
  it("rejects missing locks and changed content with the same placement ID", () => {
    expect(
      solveWithFallback([alternatives], {
        ALT: { ...lock(alternatives), lockedPlacementId: "ALT::missing" },
      }).outcome,
    ).toBe("impossible");
    const changed = {
      ...alternatives,
      sections: [
        { ...alternatives.sections[0], faculty: ["New teacher"] },
        alternatives.sections[1],
      ],
    };
    const result = solveWithFallback([changed], { ALT: lock(alternatives) });
    expect(result.outcome).toBe("impossible");
    expect(result.failure?.impossibleCourses[0].reason).toContain(
      "locked section/package",
    );
  });
  it("locks mandatory packages, and never converts a package to one section", () => {
    const combo = { ...alternatives, sectionMode: "mandatory-combo" as const };
    const prefs = lock(combo);
    expect(buildPlacements(combo, prefs)[0].sections).toHaveLength(2);
    expect(
      buildPlacements(combo, { ...prefs, sectionMode: "alternative" }),
    ).toHaveLength(0);
  });
  it("distinguishes duplicate slot labels using placement IDs plus contents", () => {
    const duplicate = course("DUP", [
      section("T1"),
      { ...section("T1", "Tuesday"), batch: "B" },
    ]);
    const placements = buildPlacements(duplicate, {
      sectionMode: "alternative",
      preferredFaculty: null,
    });
    expect(placements[0].id).not.toBe(placements[1].id);
    const result = buildPlacements(duplicate, {
      sectionMode: "alternative",
      preferredFaculty: null,
      lockedPlacementId: placements[1].id,
      lockedPlacementSignature: placementSignature(placements[1]),
    });
    expect(result[0].sections[0].batch).toBe("B");
  });
});

describe("enrollment-readiness report", () => {
  const input = () => ({
    solution: successful([a]),
    eligible: [a, b, c],
    targets: {
      ...DEFAULT_STATE.autoSettings,
      targetCount: 1,
      minFC: 1,
      minSBC: 0,
    },
    pinnedCourseCodes: [a.courseCode],
    prefs: {},
    constraints: { excludedDays: [], excludedRanges: [] },
    initialAutoCodes: [],
    datasetSource: {
      label: "2027 term",
      updatedAt: "2026-09-26T00:00:00Z",
      loadedAt: "2026-09-26T00:01:00Z",
    },
    today: "2026-09-26",
  });
  it("passes planning checks without claiming official enrollment approval", () => {
    const result = buildReadiness(input());
    expect(result.needsReview).toBe(false);
    expect(result.checks[0].detail).toContain("not an enrollment confirmation");
  });
  it("flags short subject/credit targets, category minimums and every dropped initial course", () => {
    const data = input();
    const result = buildReadiness({
      ...data,
      initialAutoCodes: [a.courseCode, b.courseCode, b.courseCode],
      targets: { ...data.targets, targetCount: 3, minSBC: 1, minFC: 2 },
    });
    expect(result.dropped).toEqual([b.courseCode]);
    for (const id of ["subjects", "SBC", "FC", "dropped"])
      expect(result.checks.find((c) => c.id === id)?.status).toBe("review");
    const credits = buildReadiness({
      ...data,
      targets: { ...data.targets, useCredits: true, targetCredits: 20 },
    });
    expect(credits.checks.find((c) => c.id === "credits")?.detail).toContain(
      "4 credits / target at least 20",
    );
    expect(credits.needsReview).toBe(true);
  });
  it("blocks missing pins, violated locks, and courses no longer eligible", () => {
    const data = input();
    expect(
      buildReadiness({ ...data, pinnedCourseCodes: [b.courseCode] }).blocked,
    ).toBe(true);
    expect(
      buildReadiness({
        ...data,
        prefs: {
          [a.courseCode]: { ...lock(a), lockedPlacementId: "different" },
        },
      }).blocked,
    ).toBe(true);
    expect(buildReadiness({ ...data, eligible: [b] }).blocked).toBe(true);
  });
  it("shows actual rule violations for the displayed solution, not another option", () => {
    const data = input();
    const result = buildReadiness({
      ...data,
      constraints: { excludedDays: ["Monday"], excludedRanges: [] },
    });
    expect(result.checks.find((c) => c.id === "rules")?.detail).toContain(
      "1 scheduled period(s)",
    );
    expect(result.needsReview).toBe(true);
  });
  it("warns about past/unknown dates and source freshness, blocking invalid export dates", () => {
    const data = input();
    const stale = buildReadiness({
      ...data,
      today: "2028-01-01",
      datasetSource: null,
    });
    for (const id of ["dates", "dataset"])
      expect(stale.checks.find((c) => c.id === id)?.status).toBe("review");
    const invalid = structuredClone(data);
    invalid.solution.placements[a.courseCode].sections[0].startDate =
      "2027-02-30";
    expect(
      buildReadiness(invalid).checks.find((c) => c.id === "dates")?.status,
    ).toBe("blocked");
  });
  it("persists requirements, initial selection and source metadata, while defaulting old sessions safely", () => {
    const data = input();
    const state = {
      ...DEFAULT_STATE,
      pinnedCourseCodes: [a.courseCode],
      coursePrefs: { [a.courseCode]: lock(a) },
      autoInitialCourseCodes: [a.courseCode, b.courseCode],
      datasetSource: data.datasetSource,
    };
    const parsed = workspaceSchema.parse({ state, drafts: [], revision: 0 });
    expect(parsed.state.pinnedCourseCodes).toEqual([a.courseCode]);
    expect(
      parsed.state.coursePrefs[a.courseCode].lockedPlacementSignature,
    ).toBe(lock(a).lockedPlacementSignature);
    expect(parsed.state.autoInitialCourseCodes).toEqual([
      a.courseCode,
      b.courseCode,
    ]);
    expect(parsed.state.datasetSource).toEqual(data.datasetSource);
    const legacy = { ...DEFAULT_STATE } as Partial<typeof DEFAULT_STATE>;
    delete legacy.pinnedCourseCodes;
    delete legacy.autoInitialCourseCodes;
    delete legacy.datasetSource;
    expect(
      workspaceSchema.parse({ state: legacy, drafts: [], revision: 0 }).state
        .pinnedCourseCodes,
    ).toEqual([]);
  });
});
