import { describe, expect, it } from "vitest";
import { itemsToText, type PdfTextItem } from "@/lib/pdfLayout";
import { parseSlotSheet } from "@/lib/parse/slotSheet";
import { solve } from "@/lib/solver";
import type { CoursePreferences } from "@/lib/types";

/**
 * Column-aware PDF reconstruction: a two-column slot sheet must serialize
 * each column independently, so a neighbour's day-line fragments can never
 * bleed into a section's schedule.
 */

/** Left column section at x=40, right column section at x=400, same rows. */
const TWO_COLUMN_ITEMS: PdfTextItem[] = [
  { str: "19AI541 [4 Credits]", x: 40, y: 560, width: 80 },
  { str: "19XX901 [2 Credits]", x: 400, y: 560, width: 80 },
  { str: "Course overview", x: 40, y: 548, width: 70 },
  { str: "Course overview", x: 400, y: 548, width: 70 },
  { str: "Cloud Computing", x: 40, y: 536, width: 70 },
  { str: "Some Elective", x: 400, y: 536, width: 70 },
  { str: "UG - 04, T1-R17, AI - SARATHI SUBRAMANI", x: 40, y: 524, width: 140 },
  { str: "UG - 04, T1-Z1, AI - OTHER FACULTY", x: 400, y: 524, width: 140 },
  { str: "Date: 16-07-2026 to 26-09-2026", x: 40, y: 512, width: 130 },
  { str: "Date: 16-07-2026 to 26-09-2026", x: 400, y: 512, width: 130 },
  // The bleed: both columns' Friday rows sit at the same y.
  { str: "Friday: 13:00 - 14:0014:00 - 15:00", x: 40, y: 500, width: 140 },
  { str: "Friday: 15:00 - 16:0016:00 - 17:00", x: 400, y: 500, width: 140 },
  { str: "Monday: 10:00 - 11:0011:00 - 12:00", x: 40, y: 488, width: 140 },
  { str: "Wednesday: 15:00 - 16:0016:00 - 17:00", x: 400, y: 488, width: 140 },
];

describe("pdfLayout.itemsToText", () => {
  const text = itemsToText(TWO_COLUMN_ITEMS);

  it("splits columns into separate chunks", () => {
    const chunks = text.split("\n\n");
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toContain("19AI541 [4 Credits]");
    expect(chunks[0]).toContain("Friday: 13:00 - 14:0014:00 - 15:00");
    expect(chunks[1]).toContain("19XX901 [2 Credits]");
    expect(chunks[1]).toContain("Friday: 15:00 - 16:0016:00 - 17:00");
  });

  it("never mixes the right column's times into the left column's lines", () => {
    const left = text.split("\n\n")[0];
    expect(left).not.toContain("15:00 - 16:0016:00 - 17:00");
    expect(left).not.toContain("Wednesday");
    const right = text.split("\n\n")[1] ?? "";
    expect(right).not.toContain("13:00 - 14:0014:00 - 15:00");
    expect(right).not.toContain("Monday");
  });

  it("keeps single-column documents intact", () => {
    const single: PdfTextItem[] = [
      { str: "19AI305 [3 Credits]", x: 40, y: 560, width: 80 },
      { str: "Course overview", x: 40, y: 548, width: 70 },
      { str: "Advanced C Programming", x: 40, y: 536, width: 100 },
      { str: "UG - 04, T1-P3, AI - Trainer 10 .", x: 40, y: 524, width: 130 },
      { str: "Date: 21-01-2026 to 28-03-2026", x: 40, y: 512, width: 130 },
      { str: "Friday: 15:00 - 16:0016:00 - 17:00", x: 40, y: 500, width: 130 },
    ];
    const text = itemsToText(single);
    expect(text).toContain("19AI305 [3 Credits]");
    expect(text).toContain("Friday: 15:00 - 16:0016:00 - 17:00");
  });

  it("returns empty text when items lack coordinates (fallback path)", () => {
    expect(itemsToText([{ str: "no coords here" }])).toBe("");
    expect(itemsToText([])).toBe("");
  });

  it("end-to-end: extracted columns parse into clean sections that solve", () => {
    const text = itemsToText(TWO_COLUMN_ITEMS);
    const { courses } = parseSlotSheet(text);
    expect(courses.map((c) => c.courseCode)).toEqual(["19AI541", "19XX901"]);
    const r17 = courses[0].sections.find((s) => s.slotCode === "T1-R17")!;
    // Monday intact, no Wednesday bleed, no duplicated Friday
    expect(r17.weeklyCells.filter((c) => c.day === "Monday")).toHaveLength(2);
    expect(r17.weeklyCells.filter((c) => c.day === "Wednesday")).toHaveLength(0);
    expect(r17.weeklyCells).toHaveLength(4);

    const prefs: Record<string, CoursePreferences> = {};
    for (const c of courses) prefs[c.courseCode] = { sectionMode: "alternative", preferredFaculty: null };
    const r = solve(courses, prefs);
    expect(r.ok).toBe(true);
  });
});
