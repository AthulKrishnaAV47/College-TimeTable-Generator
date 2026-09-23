import { describe, expect, it } from "vitest";
import { parseSlotSheet, defaultSectionMode } from "@/lib/parse/slotSheet";
import { parseEligibilityTable } from "@/lib/parse/eligibility";
import { buildEligibility, normCode } from "@/lib/eligibility";
import { mergeCells, firstOccurrence, ddmmyyyyToIso, weekdayOf } from "@/lib/time";
import { SAMPLE_SLOT_SHEET, SAMPLE_ELIGIBILITY } from "@/lib/sample";

describe("File A — MyCamu slot sheet parser", () => {
  const { courses, warnings } = parseSlotSheet(SAMPLE_SLOT_SHEET);

  it("parses every course block", () => {
    const codes = courses.map((c) => c.courseCode);
    expect(codes).toContain("19AI305");
    expect(codes).toContain("19CS305");
    expect(codes).toContain("19AI301");
    expect(codes).toContain("19EE305");
    expect(codes).toContain("19JP301");
    expect(codes).toContain("19CY801");
    expect(codes).toContain("19HS801");
    expect(codes).toContain("19AI410");
    expect(codes).toContain("QNX RTOS");
    expect(courses).toHaveLength(9);
  });

  it("extracts course metadata", () => {
    const adv = courses.find((c) => c.courseCode === "19AI305")!;
    expect(adv.credits).toBe(3);
    expect(adv.category).toBe("ENGINEERING SCIENCES - ENGINEERING SCIENCES");
    expect(adv.courseName).toBe("Advanced C Programming");
  });

  it("parses section batch/slot/dept/faculty and ISO dates", () => {
    const adv = courses.find((c) => c.courseCode === "19AI305")!;
    const p3 = adv.sections.find((s) => s.slotCode === "T1-P3")!;
    expect(p3.batch).toBe("UG - 04");
    expect(p3.department).toBe("AI");
    expect(p3.faculty).toEqual(["Trainer 10"]);
    expect(p3.startDate).toBe("2026-01-21");
    expect(p3.endDate).toBe("2026-03-28");
  });

  it("expands concatenated hour blocks into individual 1-hour cells", () => {
    const adv = courses.find((c) => c.courseCode === "19AI305")!;
    const p3 = adv.sections.find((s) => s.slotCode === "T1-P3")!;
    // "Friday: 15:00 - 16:0016:00 - 17:00" + "Wednesday: 08:00 - 09:0009:00 - 10:00"
    expect(p3.weeklyCells).toHaveLength(4);
    expect(p3.weeklyCells.map((c) => `${c.day} ${c.startTime}-${c.endTime}`)).toEqual([
      "Friday 15:00-16:00",
      "Friday 16:00-17:00",
      "Wednesday 08:00-09:00",
      "Wednesday 09:00-10:00",
    ]);
    expect(p3.weeklyHours).toBe(4);
  });

  it("supports a two-faculty section", () => {
    const ca = courses.find((c) => c.courseCode === "19CS305")!;
    const v7 = ca.sections.find((s) => s.slotCode === "T1-V7")!;
    expect(v7.faculty).toEqual(["MAHENDRAN K", "Baraneedharan .P"]);
  });

  it("treats 1-minute placeholder sections as self-paced", () => {
    const env = courses.find((c) => c.courseCode === "19CY801")!;
    expect(env.sections).toHaveLength(2);
    for (const s of env.sections) {
      expect(s.selfPaced).toBe(true);
      expect(s.weeklyCells[0].startTime).toBe("17:04");
      expect(s.weeklyCells[0].endTime).toBe("17:05");
    }
    const hv = courses.find((c) => c.courseCode === "19HS801")!;
    expect(hv.sections[0].selfPaced).toBe(true);
    // A real section must NOT be flagged
    const adv = courses.find((c) => c.courseCode === "19AI305")!;
    expect(adv.sections.every((s) => !s.selfPaced)).toBe(true);
  });

  it("handles the non-standard 'QNX RTOS' code and single-day range with 4 contiguous cells", () => {
    const qnx = courses.find((c) => c.courseCode === "QNX RTOS")!;
    expect(qnx.credits).toBe(2);
    expect(qnx.category).toBe("ORIENTATION PROGRAM - ORIENTATION PROGRAM");
    expect(qnx.sections).toHaveLength(1);
    expect(qnx.sections[0].weeklyCells).toHaveLength(4);
    expect(qnx.sections[0].startDate).toBe("2026-01-21");
    expect(qnx.sections[0].endDate).toBe("2026-01-21");
    expect(warnings.some((w) => w.includes("Non-standard course code"))).toBe(true);
  });

  it("merges non-adjacent duplicate course blocks into one entry", () => {
    const ds = courses.find((c) => c.courseCode === "19AI301")!;
    expect(ds.courseName).toBe("Data Structures");
    expect(ds.sections.map((s) => s.slotCode).sort()).toEqual(["T1-A1", "T1-A2", "T1-A3"]);
  });

  it("applies the mandatory-combo heuristic as default", () => {
    const adv = courses.find((c) => c.courseCode === "19AI305")!;
    expect(adv.sectionMode).toBe("mandatory-combo"); // 2 sections, same faculty
    const ca = courses.find((c) => c.courseCode === "19CS305")!;
    expect(ca.sectionMode).toBe("alternative"); // 4 sections
    const ee = courses.find((c) => c.courseCode === "19EE305")!;
    expect(ee.sectionMode).toBe("mandatory-combo"); // L1+P1 same faculty
  });

  it("tolerates blank lines and does not crash on empty input", () => {
    expect(parseSlotSheet("").courses).toHaveLength(0);
    expect(parseSlotSheet("   \n\n").courses).toHaveLength(0);
  });
});

describe("time helpers", () => {
  it("merges contiguous cells for display", () => {
    const merged = mergeCells([
      { day: "Friday", startTime: "15:00", endTime: "16:00" },
      { day: "Friday", startTime: "16:00", endTime: "17:00" },
      { day: "Monday", startTime: "08:00", endTime: "09:00" },
    ]);
    expect(merged).toEqual([
      { day: "Friday", startTime: "15:00", endTime: "17:00" },
      { day: "Monday", startTime: "08:00", endTime: "09:00" },
    ]);
  });

  it("converts DD-MM-YYYY to ISO", () => {
    expect(ddmmyyyyToIso("21-01-2026")).toBe("2026-01-21");
  });

  it("computes weekdays and first occurrences", () => {
    expect(weekdayOf("2026-01-21")).toBe("Wednesday");
    expect(firstOccurrence("2026-01-21", "Friday")).toBe("2026-01-23");
    expect(firstOccurrence("2026-01-21", "Wednesday")).toBe("2026-01-21");
  });
});

describe("File B — SBC/FC eligibility parser", () => {
  const { rows, warnings } = parseEligibilityTable(SAMPLE_ELIGIBILITY);

  it("parses pipe-separated rows and skips the header", () => {
    expect(rows.length).toBe(12);
    expect(rows[0]).toEqual({ courseCode: "19AI301", type: "SBC", year: "I" });
  });

  it("preserves duplicate course codes across year levels", () => {
    const cs = rows.filter((r) => r.courseCode === "19CS305");
    expect(cs).toHaveLength(2);
    expect(cs.map((r) => r.year).sort()).toEqual(["I", "II & III"]);
    expect(warnings.some((w) => w.includes("19CS305 has 2 eligibility rows"))).toBe(true);
  });

  it("normalizes messy year and type spellings", () => {
    const { rows: r2 } = parseEligibilityTable(
      "19XX101  SBC   I\n19XX102 fc II & III\n19XX103 FC II&III\n19XX104 SBC i\n19XX105 FC II and III"
    );
    expect(r2).toEqual([
      { courseCode: "19XX101", type: "SBC", year: "I" },
      { courseCode: "19XX102", type: "FC", year: "II & III" },
      { courseCode: "19XX103", type: "FC", year: "II & III" },
      { courseCode: "19XX104", type: "SBC", year: "I" },
      { courseCode: "19XX105", type: "FC", year: "II & III" },
    ]);
  });

  it("parses CSV and tab layouts", () => {
    const csv = parseEligibilityTable("19ZZ201,SBC,I\n19ZZ202,FC,II & III");
    expect(csv.rows).toHaveLength(2);
    const tsv = parseEligibilityTable("19ZZ301\tSBC\tI");
    expect(tsv.rows).toHaveLength(1);
  });
});

describe("eligibility intersection (§3.2)", () => {
  const { courses } = parseSlotSheet(SAMPLE_SLOT_SHEET);
  const { rows } = parseEligibilityTable(SAMPLE_ELIGIBILITY);

  it("filters File A by year and completion for Year I", () => {
    const summary = buildEligibility(courses, rows, {
      year: "I",
      termLabel: "Year I - Term 2",
      completedCourseCodes: ["19ai301"], // case-insensitive completed code
    });
    const codes = [...summary.sbc, ...summary.fc].map((c) => c.courseCode);
    expect(codes.sort()).toEqual(
      ["19AI305", "19CS305", "19EE305", "19JP301", "19CY801", "19HS801"].sort()
    );
    expect(summary.sbc.map((c) => c.courseCode)).toEqual(["19JP301"]);
    expect(summary.excludedByCompletion.map((c) => c.courseCode)).toEqual(["19AI301"]);
    // offered but only for Years II & III
    expect(summary.excludedByYear).toEqual(["19AI410"]);
    // QNX RTOS has no File B row at all
    expect(summary.notInEligibilityTable).toEqual(["QNX RTOS"]);
  });

  it("filters for Years II & III — including Year I subjects", () => {
    const summary = buildEligibility(courses, rows, {
      year: "II & III",
      termLabel: "Year II & III - Term 1",
      completedCourseCodes: [],
    });
    const codes = [...summary.sbc, ...summary.fc].map((c) => c.courseCode).sort();
    // Own-year rows (19CS305, 19AI410) plus every Year I subject offered this term.
    expect(codes.sort()).toEqual(
      [
        "19AI301",
        "19AI305",
        "19AI410",
        "19CS305",
        "19CY801",
        "19EE305",
        "19HS801",
        "19JP301",
      ].sort()
    );
    // Own-year rows are authoritative for SBC/FC; Year I rows fill the rest.
    expect(summary.fc.map((c) => c.courseCode).sort()).toEqual(
      ["19AI305", "19AI410", "19CS305", "19CY801", "19EE305", "19HS801"].sort()
    );
    expect(summary.sbc.map((c) => c.courseCode).sort()).toEqual(["19AI301", "19JP301"].sort());
    // 19DE301 has a II & III row but isn't offered this term → absent (not excluded-by-year).
    // Nothing offered carries a File B row that misses both year levels → excludedByYear is empty.
    expect(summary.excludedByYear).toEqual([]);
    expect(summary.notInEligibilityTable).toEqual(["QNX RTOS"]);
  });

  it("still keeps Year I students out of II & III-only courses", () => {
    const summary = buildEligibility(courses, rows, {
      year: "I",
      termLabel: "Year I - Term 2",
      completedCourseCodes: [],
    });
    const codes = [...summary.sbc, ...summary.fc].map((c) => c.courseCode);
    expect(codes).not.toContain("19AI410"); // II & III only
    expect(summary.excludedByYear).toEqual(["19AI410"]);
  });

  it("normalizes codes", () => {
    expect(normCode(" 19ai301 ")).toBe("19AI301");
  });
});
