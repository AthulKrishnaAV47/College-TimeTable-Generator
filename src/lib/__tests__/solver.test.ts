import { describe, expect, it } from "vitest";
import { buildPlacements, solve, autoSelectCourses, computeMetrics } from "@/lib/solver";
import type { Course, EligibleSubject, Section, TimeCell } from "@/lib/types";
import { cellKey } from "@/lib/time";

function sec(
  slotCode: string,
  faculty: string[],
  cells: [string, string, string][]
): Section {
  return {
    batch: "UG - 04",
    slotCode,
    department: "AI",
    faculty,
    startDate: "2026-01-21",
    endDate: "2026-03-28",
    weeklyCells: cells.map(([day, s, e]) => ({ day, startTime: s, endTime: e }) as TimeCell),
    weeklyHours: cells.length,
    selfPaced: false,
  };
}

function course(code: string, name: string, credits: number, sections: Section[]): Course {
  return { courseCode: code, credits, category: "TEST - TEST", courseName: name, sections, sectionMode: "alternative" };
}

describe("placement building (§3.4)", () => {
  it("alternative mode → one placement per section", () => {
    const c = course("19XX101", "X", 3, [
      sec("T1-A1", ["F1"], [["Monday", "08:00", "09:00"]]),
      sec("T1-A2", ["F2"], [["Monday", "09:00", "10:00"]]),
    ]);
    const p = buildPlacements(c, { sectionMode: "alternative", preferredFaculty: null });
    expect(p).toHaveLength(2);
    expect(p[0].busy).toHaveLength(1);
  });

  it("mandatory-combo mode → single placement with all sections' cells", () => {
    const c = course("19XX101", "X", 3, [
      sec("T1-L1", ["F1"], [["Tuesday", "15:00", "16:00"]]),
      sec("T1-P1", ["F1"], [["Thursday", "15:00", "16:00"]]),
    ]);
    const p = buildPlacements(c, { sectionMode: "mandatory-combo", preferredFaculty: null });
    expect(p).toHaveLength(1);
    expect(p[0].busy).toHaveLength(2);
  });

  it("self-overlapping combo is impossible (zero placements)", () => {
    const c = course("19XX101", "X", 3, [
      sec("T1-L1", ["F1"], [["Tuesday", "15:00", "17:00"]]),
      sec("T1-P1", ["F1"], [["Tuesday", "16:00", "17:00"]]),
    ]);
    const p = buildPlacements(c, { sectionMode: "mandatory-combo", preferredFaculty: null });
    expect(p).toHaveLength(0);
  });

  it("placeholder cells never appear in busy sets", () => {
    const c = course("19CY801", "Env", 2, [
      sec("T1-E1", ["F1"], [["Wednesday", "17:04", "17:05"]]),
    ]);
    const p = buildPlacements(c, { sectionMode: "alternative", preferredFaculty: null });
    expect(p[0].busy).toHaveLength(0);
  });
});

describe("solver (§3.5)", () => {
  const prefs = (mode: "alternative" | "mandatory-combo" = "alternative") => ({
    sectionMode: mode,
    preferredFaculty: null,
  });

  it("finds a valid assignment for alternatives with overlap pressure", () => {
    const a = course("19XX101", "A", 3, [
      sec("T1-A1", ["F1"], [["Monday", "08:00", "09:00"]]),
      sec("T1-A2", ["F1"], [["Tuesday", "08:00", "09:00"]]),
    ]);
    const b = course("19XX102", "B", 3, [
      sec("T1-B1", ["F2"], [["Monday", "08:00", "09:00"]]), // collides with A1 only
      sec("T1-B2", ["F2"], [["Wednesday", "08:00", "09:00"]]),
    ]);
    const r = solve([a, b], { "19XX101": prefs(), "19XX102": prefs() });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.solutions.length).toBeGreaterThan(0);
      const best = r.solutions[0];
      // must not have both on Monday 8-9
      const busyKeys = Object.values(best.placements).flatMap((p) => p.busy.map(cellKey));
      expect(new Set(busyKeys).size).toBe(busyKeys.length);
    }
  });

  it("self-paced courses never block real courses", () => {
    const a = course("19XX101", "A", 3, [sec("T1-A1", ["F1"], [["Monday", "08:00", "09:00"]])]);
    const env = course("19CY801", "Env", 2, [sec("T1-E1", ["F2"], [["Monday", "08:00", "09:00"], ["Tuesday", "17:04", "17:05"]])]);
    // make the "real" Monday cell a placeholder by replacing cells
    env.sections[0].weeklyCells = [
      { day: "Monday", startTime: "17:04", endTime: "17:05" },
      { day: "Tuesday", startTime: "17:05", endTime: "17:06" },
    ];
    env.sections[0].selfPaced = true;
    const r = solve([a, env], { "19XX101": prefs(), "19CY801": prefs() });
    expect(r.ok).toBe(true);
  });

  it("reports mutually blocking courses instead of a generic failure", () => {
    const a = course("19XX101", "A", 3, [sec("T1-A1", ["F1"], [["Monday", "08:00", "10:00"]])]);
    const b = course("19XX102", "B", 3, [sec("T1-B1", ["F2"], [["Monday", "09:00", "10:00"]])]);
    const r = solve([a, b], { "19XX101": prefs(), "19XX102": prefs() });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.blockingPairs).toHaveLength(1);
      expect(r.blockingPairs[0].courseA).toBe("19XX101");
      expect(r.blockingPairs[0].courseB).toBe("19XX102");
      expect(r.message).toContain("19XX101 and 19XX102 have no non-overlapping section pair");
    }
  });

  it("reports impossible combos as impossible courses", () => {
    const a = course("19XX101", "A", 3, [
      sec("T1-L1", ["F1"], [["Monday", "08:00", "09:00"]]),
      sec("T1-P1", ["F1"], [["Monday", "08:00", "09:00"]]),
    ]);
    const r = solve([a], { "19XX101": prefs("mandatory-combo") });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.impossibleCourses).toHaveLength(1);
      expect(r.impossibleCourses[0].reason).toContain("overlap each other");
    }
  });

  it("ranks solutions: fewer gaps first", () => {
    const a = course("19XX101", "A", 3, [
      sec("T1-A1", ["F1"], [["Monday", "08:00", "09:00"]]),
      sec("T1-A2", ["F1"], [["Monday", "15:00", "16:00"]]),
    ]);
    const b = course("19XX102", "B", 3, [
      sec("T1-B1", ["F2"], [["Monday", "09:00", "10:00"]]),
      sec("T1-B2", ["F2"], [["Monday", "08:00", "09:00"]]),
    ]);
    const r = solve([a, b], { "19XX101": prefs(), "19XX102": prefs() }, { rankBy: "fewest-gaps" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const best = r.solutions[0];
      expect(best.metrics.totalGaps).toBe(0);
      const m = computeMetrics(Object.values(best.placements));
      expect(m.weeklyContactHours).toBe(2);
      expect(m.daysWithClasses).toBe(1);
    }
  });

  it("respects preferred faculty in ranking", () => {
    const a = course("19XX101", "A", 3, [
      sec("T1-A1", ["Sriram K"], [["Monday", "08:00", "09:00"]]),
      sec("T1-A2", ["Priya R"], [["Tuesday", "08:00", "09:00"]]),
    ]);
    const r = solve([a], { "19XX101": { sectionMode: "alternative", preferredFaculty: "Priya R" } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.solutions[0].assignment["19XX101"]).toContain("T1-A2");
      expect(r.solutions[0].metrics.preferredFacultyHits).toBe(1);
    }
  });

  it("respects mandatory combos as fixed packages", () => {
    const combo = course("19XX101", "A", 3, [
      sec("T1-L1", ["F1"], [["Monday", "08:00", "09:00"]]),
      sec("T1-P1", ["F1"], [["Friday", "15:00", "16:00"]]),
    ]);
    const b = course("19XX102", "B", 3, [
      sec("T1-B1", ["F2"], [["Friday", "15:00", "16:00"]]),
      sec("T1-B2", ["F2"], [["Tuesday", "08:00", "09:00"]]),
    ]);
    const r = solve([combo, b], {
      "19XX101": prefs("mandatory-combo"),
      "19XX102": prefs(),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // B must avoid Friday 15-16 because the combo fixed it
      expect(r.solutions[0].assignment["19XX102"]).toContain("T1-B2");
    }
  });

  it("enforces zero overlap across all chosen placements", () => {
    const a = course("19XX101", "A", 3, [
      sec("T1-A0", ["F0"], [["Monday", "08:00", "09:00"], ["Tuesday", "08:00", "09:00"]]),
      sec("T1-A1", ["F1"], [["Wednesday", "08:00", "09:00"]]),
    ]);
    const b = course("19XX102", "B", 3, [
      sec("T1-B0", ["G0"], [["Monday", "08:00", "09:00"]]),
      sec("T1-B1", ["G1"], [["Wednesday", "08:00", "09:00"]]),
    ]);
    const r = solve([a, b], { "19XX101": prefs(), "19XX102": prefs() });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const all = Object.values(r.solutions[0].placements).flatMap((p) => p.busy.map(cellKey));
      expect(new Set(all).size).toBe(all.length);
    }
  });
});

describe("no-class constraints (excluded days & time windows)", () => {
  const prefs = { sectionMode: "alternative" as const, preferredFaculty: null };

  it("excludes whole days", () => {
    const a = course("19XX101", "A", 3, [
      sec("T1-A1", ["F1"], [["Saturday", "10:00", "12:00"]]),
      sec("T1-A2", ["F1"], [["Wednesday", "10:00", "12:00"]]),
    ]);
    const r = solve([a], { "19XX101": prefs }, {
      constraints: { excludedDays: ["Saturday"], excludedRanges: [] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.solutions[0].assignment["19XX101"]).toContain("T1-A2");
  });

  it("excludes time windows with partial overlaps counted", () => {
    const a = course("19XX101", "A", 3, [
      sec("T1-A1", ["F1"], [["Monday", "14:00", "16:00"]]), // overlaps the 15:00–17:00 window
      sec("T1-A2", ["F1"], [["Monday", "10:00", "12:00"]]),
    ]);
    const r = solve([a], { "19XX101": prefs }, {
      constraints: { excludedDays: [], excludedRanges: [{ start: "15:00", end: "17:00" }] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.solutions[0].assignment["19XX101"]).toContain("T1-A2");
  });

  it("drops combo packages whose cells hit an excluded window", () => {
    const a = course("19XX101", "A", 3, [
      sec("T1-L1", ["F1"], [["Monday", "08:00", "09:00"]]),
      sec("T1-P1", ["F1"], [["Monday", "15:00", "16:00"]]),
    ]);
    const r = solve([a], { "19XX101": { sectionMode: "mandatory-combo", preferredFaculty: null } }, {
      constraints: { excludedDays: [], excludedRanges: [{ start: "15:00", end: "17:00" }] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.impossibleCourses[0].reason).toMatch(/excluded|no-class/i);
    }
  });

  it("reports a course fully blocked by constraints with a distinct reason", () => {
    const a = course("19XX101", "A", 3, [sec("T1-A1", ["F1"], [["Saturday", "10:00", "12:00"]])]);
    const r = solve([a], { "19XX101": prefs }, {
      constraints: { excludedDays: ["Saturday"], excludedRanges: [] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.impossibleCourses).toHaveLength(1);
      expect(r.impossibleCourses[0].reason).toMatch(/no-class rules/i);
      expect(r.message).toMatch(/relaxing the no-class/i);
    }
  });

  it("self-paced courses ignore constraints (no real time cells)", () => {
    const env = course("19CY801", "Env", 2, [
      sec("T1-E1", ["F1"], [["Saturday", "17:04", "17:05"]]),
    ]);
    env.sections[0].selfPaced = true;
    const r = solve([env], { "19CY801": prefs }, {
      constraints: { excludedDays: ["Saturday"], excludedRanges: [] },
    });
    expect(r.ok).toBe(true);
  });

  it("auto-select swaps out courses that cannot respect the constraints", () => {
    const satOnly = course("19XX101", "A", 4, [
      sec("T1-A1", ["F1"], [["Saturday", "10:00", "12:00"]]),
    ]);
    (satOnly as EligibleSubject).type = "SBC";
    const weekday = course("19XX102", "B", 3, [
      sec("T1-B1", ["F2"], [["Monday", "10:00", "12:00"]]),
    ]);
    (weekday as EligibleSubject).type = "FC";
    const subjects = [satOnly, weekday];
    const r = autoSelectCourses(
      subjects,
      { "19XX101": prefs, "19XX102": prefs },
      { targetCount: 2, constraints: { excludedDays: ["Saturday"], excludedRanges: [] } }
    );
    expect(r.ok).toBe(true);
    expect(r.chosen.map((c) => c.courseCode)).toEqual(["19XX102"]);
    expect(r.attempts.some((a) => a.outcome === "unsat")).toBe(true);
  });
});

describe("auto subject selection (§3.3)", () => {
  const prefs = {
    sectionMode: "alternative" as const,
    preferredFaculty: null,
  };
  const p = (c: Course) => prefs;

  const mk = (code: string, credits: number, slots: [string, string, string][], type?: "SBC" | "FC") => {
    const c = course(code, code, credits, [
      sec(`T1-${code}-0`, ["F0"], [slots[0]]),
      sec(`T1-${code}-1`, ["F1"], [slots[1]]),
    ]);
    if (type) (c as EligibleSubject).type = type;
    return c as EligibleSubject;
  };

  it("picks a feasible subset honoring the target count", () => {
    const subjects = [
      mk("19XX101", 4, [["Monday", "08:00", "09:00"], ["Monday", "08:00", "09:00"]], "SBC"),
      mk("19XX102", 3, [["Tuesday", "08:00", "09:00"], ["Tuesday", "09:00", "10:00"]], "FC"),
      mk("19XX103", 3, [["Wednesday", "08:00", "09:00"], ["Wednesday", "09:00", "10:00"]], "FC"),
    ];
    const r = autoSelectCourses(subjects, Object.fromEntries(subjects.map((s) => [s.courseCode, p(s)])), {
      targetCount: 3,
      minSBC: 1,
      minFC: 2,
    });
    expect(r.ok).toBe(true);
    expect(r.chosen).toHaveLength(3);
  });

  it("falls back by dropping the most constrained subject when unsatisfiable", () => {
    // Three single-section courses all on Monday 08:00–09:00: no subset of
    // 2+ is schedulable, so auto mode must drop the least valuable first
    // (fewest credits among equally-constrained subjects) and keep the 4-credit one.
    const bottleneck = mk("19XX101", 4, [["Monday", "08:00", "09:00"], ["Monday", "08:00", "09:00"]], "SBC");
    bottleneck.sections = [sec("T1-ONLY", ["F0"], [["Monday", "08:00", "09:00"]])];
    const other1 = mk("19XX102", 3, [["Monday", "08:00", "09:00"], ["Monday", "08:00", "09:00"]], "FC");
    other1.sections = [sec("T1-O1", ["F1"], [["Monday", "08:00", "09:00"]])];
    const other2 = mk("19XX103", 3, [["Monday", "08:00", "09:00"], ["Monday", "08:00", "09:00"]], "FC");
    other2.sections = [sec("T1-O2", ["F2"], [["Monday", "08:00", "09:00"]])];
    const subjects = [bottleneck, other1, other2];
    const r = autoSelectCourses(subjects, Object.fromEntries(subjects.map((s) => [s.courseCode, p(s)])), {
      targetCount: 3,
      maxAttempts: 20,
    });
    expect(r.ok).toBe(true);
    // Repairs happened and only the highest-value subject survives.
    expect(r.attempts.some((a) => a.outcome === "unsat")).toBe(true);
    expect(r.chosen.map((c) => c.courseCode)).toEqual(["19XX101"]);
  });

  it("returns the last failure diagnostics when nothing works", () => {
    const a = mk("19XX101", 3, [["Monday", "08:00", "09:00"], ["Monday", "08:00", "09:00"]], "SBC");
    a.sections = [sec("T1-A", ["F0"], [["Monday", "08:00", "09:00"]])];
    const b = mk("19XX102", 3, [["Monday", "08:00", "09:00"], ["Monday", "08:00", "09:00"]], "FC");
    b.sections = [sec("T1-B", ["F1"], [["Monday", "08:00", "09:00"]])];
    const r = autoSelectCourses([a, b], { "19XX101": p(a), "19XX102": p(b) }, {
      targetCount: 2,
      minSBC: 1,
      minFC: 1,
      maxAttempts: 5,
    });
    expect(r.ok).toBe(false);
    expect(r.failure?.blockingPairs.length ?? 0).toBeGreaterThan(0);
  });
});
