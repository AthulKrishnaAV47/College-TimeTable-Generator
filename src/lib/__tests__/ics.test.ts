import { describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/ics";
import { buildPlacements } from "@/lib/solver";
import type { Course, Section, StudentProfile, Weekday } from "@/lib/types";

function sec(
  slotCode: string,
  faculty: string[],
  cells: [Weekday, string, string][],
  selfPaced = false
): Section {
  return {
    batch: "UG - 04",
    slotCode,
    department: "AI",
    faculty,
    startDate: "2026-01-21",
    endDate: "2026-03-28",
    weeklyCells: cells.map(([day, s, e]) => ({ day, startTime: s, endTime: e })),
    weeklyHours: cells.length,
    selfPaced,
  };
}

const profile: StudentProfile = {
  year: "I",
  termLabel: "Year I - Term 2 Schedule",
  completedCourseCodes: [],
};

describe("ICS export (§3.6)", () => {
  it("emits weekly recurring events between the section date range", () => {
    const course: Course = {
      courseCode: "19AI305",
      credits: 3,
      category: "ENGINEERING SCIENCES",
      courseName: "Advanced C Programming",
      sectionMode: "alternative",
      sections: [sec("T1-P3", ["Trainer 10"], [["Friday", "15:00", "17:00"]])],
    };
    const placement = buildPlacements(course, { sectionMode: "alternative", preferredFaculty: null })[0];
    const ics = buildIcs([{ placement, courseName: course.courseName }], profile);

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("X-WR-CALNAME:Year I - Term 2 Schedule");
    expect(ics).toContain("DTSTART:20260123T150000"); // first Friday on/after 21-01-2026
    expect(ics).toContain("DTEND:20260123T170000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20260328T235959;BYDAY=FR");
    expect(ics).toContain("SUMMARY:19AI305 Advanced C Programming");
    // Unfold (RFC 5545 §3.1) before checking long folded lines
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("Faculty: Trainer 10");
    expect(unfolded).toContain("Section T1-P3 (UG - 04)");
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
    // CRLF line endings per RFC 5545
    expect(ics.includes("\r\n")).toBe(true);
  });

  it("skips self-paced placeholder sections entirely", () => {
    const course: Course = {
      courseCode: "19CY801",
      credits: 2,
      category: "VALUE EDUCATION",
      courseName: "Environmental Sciences",
      sectionMode: "alternative",
      sections: [sec("T1-E1", ["Meera S"], [["Wednesday", "17:04", "17:05"]], true)],
    };
    const placement = buildPlacements(course, { sectionMode: "alternative", preferredFaculty: null })[0];
    const ics = buildIcs([{ placement, courseName: course.courseName }], profile);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("escapes commas in text fields", () => {
    const course: Course = {
      courseCode: "19XX101",
      credits: 3,
      category: "T",
      courseName: "Commas, Semicolons; Test",
      sectionMode: "alternative",
      sections: [sec("T1-A1", ["A, B"], [["Monday", "08:00", "09:00"]])],
    };
    const placement = buildPlacements(course, { sectionMode: "alternative", preferredFaculty: null })[0];
    const ics = buildIcs([{ placement, courseName: course.courseName }], profile);
    expect(ics).toContain("SUMMARY:19XX101 Commas\\, Semicolons\\; Test");
    expect(ics).toContain("Faculty: A\\, B");
  });
});
