import {
  type Course,
  type Section,
  type SlotSheetParseResult,
  type TimeCell,
  type Weekday,
} from "../types";
import { ddmmyyyyToIso, isPlaceholderCell } from "../time";

/**
 * Parser for File A — the MyCamu term slot sheet ("course overview" PDF export).
 *
 * The input is the raw line-by-line text extracted from the PDF (server-side
 * via pdf.js/unpdf). The grammar (from real exports):
 *
 *   19AI305 [3 Credits]                          ← course header
 *   ENGINEERING SCIENCES - ENGINEERING SCIENCES  ← category
 *   Course overview                              ← fixed marker, skipped
 *   Advanced C Programming                       ← course name
 *   UG - 04, T1-P3, AI - Trainer 10 .            ← section line
 *   Date: 21-01-2026 to 28-03-2026               ← section dates
 *   Friday: 15:00 - 16:0016:00 - 17:00           ← day line (concatenated blocks)
 *   Monday: 08:00 - 09:0009:00 - 10:00
 *   ... (repeats per section until the next header / EOF)
 */

// Course header: "19AI305 [3 Credits]" but also non-standard codes like
// "QNX RTOS [2 Credits]" — tolerate any code text, don't assume the
// digit-letter-digit pattern.
const COURSE_HEADER_RE = /^([A-Za-z0-9][A-Za-z0-9&'().\-/ ]*?)\s*\[(\d+)\s*Credits\]\s*$/i;

// A plausible MyCamu course code, used only for anomaly warnings.
const STANDARD_CODE_RE = /^\d{2}[A-Z]{2}\d{3}$/;

const MARKER_LINE = /^course overview$/i;

const DATE_LINE_RE = /^Date:\s*(\d{1,2}-\d{1,2}-\d{4})\s*to\s*(\d{1,2}-\d{1,2}-\d{4})\s*$/i;

const DAY_LINE_RE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*:\s*(.*)$/i;

// "15:00 - 16:0016:00 - 17:00" → two contiguous 1-hour cells. One-hour blocks
// are concatenated with no separator, so scan for every HH:MM - HH:MM match.
const TIME_RANGE_RE = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g;

// Section line: "<Batch>, <SlotCode>, <Dept> - <Faculty...>"
// SlotCode is the 2nd comma part, e.g. "T1-P3" / "T1-L3" / "T1-BLENDED"
const SLOT_CODE_RE = /^[A-Za-z]{1,3}\d+(?:-BLENDED(?:-\d+)?)?(?:\s*-\s*[A-Za-z]{0,3}\d+)?$/i;

export function parseSectionLine(line: string): {
  batch: string;
  slotCode: string;
  department: string;
  faculty: string[];
} | null {
  const parts = line.split(",");
  if (parts.length < 3) return null;
  const slotCandidate = parts[1].trim();
  if (!SLOT_CODE_RE.test(slotCandidate)) return null;
  const batch = parts[0].trim();
  const slotCode = slotCandidate.replace(/\s*-\s*/g, "-");
  const tail = parts.slice(2).join(",").trim();
  const sep = tail.indexOf(" - ");
  let department = "";
  let facultyText = tail;
  if (sep >= 0) {
    department = tail.slice(0, sep).trim();
    facultyText = tail.slice(sep + 3).trim();
  }
  const faculty = facultyText
    .split(",")
    .map((f) => f.trim().replace(/\s*\.$/, "").trim())
    .filter((f) => f.length > 0);
  return { batch, slotCode, department, faculty };
}

function parseDayLine(rest: string, day: Weekday): TimeCell[] {
  const cells: TimeCell[] = [];
  TIME_RANGE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME_RANGE_RE.exec(rest)) !== null) {
    const start = `${m[1].padStart(2, "0")}:${m[2]}`;
    const end = `${m[3].padStart(2, "0")}:${m[4]}`;
    cells.push({ day, startTime: start, endTime: end });
  }
  return cells;
}

/**
 * Heuristic (a starting suggestion only — the user always overrides in the UI):
 * exactly 2 sections sharing the exact same faculty set → likely a
 * Lecture + Practical package → default to "mandatory-combo";
 * otherwise "alternative" (pick exactly one).
 */
export function defaultSectionMode(sections: Section[]): "alternative" | "mandatory-combo" {
  if (sections.length !== 2) return "alternative";
  const key = (f: string[]) => [...f].map((x) => x.toLowerCase()).sort().join("§");
  const first = key(sections[0].faculty);
  return first.length > 0 && sections.every((s) => key(s.faculty) === first)
    ? "mandatory-combo"
    : "alternative";
}

export function parseSlotSheet(text: string): SlotSheetParseResult {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\u00a0/g, " ").trim());

  const byCode = new Map<string, Course>();
  let current: Course | null = null;
  let currentSection: Section | null = null;

  const flushSection = () => {
    if (currentSection && current) {
      current.sections.push(currentSection);
    } else if (currentSection && !current) {
      warnings.push("Found a schedule block outside any course; skipped.");
    }
    currentSection = null;
  };

  const flushCourse = () => {
    flushSection();
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 1. Course header → (re)start a course block
    const header = line.match(COURSE_HEADER_RE);
    if (header) {
      flushCourse();
      const code = header[1].trim();
      const credits = parseInt(header[2], 10);
      const existing = byCode.get(code);
      if (existing) {
        // Same course code again (offered to another batch, possibly
        // non-adjacent): merge sections into the single course entry.
        current = existing;
        warnings.push(
          `Course ${code} appears in multiple blocks — sections merged into one course entry.`
        );
      } else {
        current = {
          courseCode: code,
          credits,
          category: "",
          courseName: "",
          sections: [],
          sectionMode: "alternative",
        };
        byCode.set(code, current);
      }
      if (!STANDARD_CODE_RE.test(code)) {
        warnings.push(`Non-standard course code "${code}" (does not match the 19XX### pattern).`);
      }
      continue;
    }

    if (!current) {
      if (!MARKER_LINE.test(line)) {
        warnings.push(`Ignored line before the first course header: "${line.slice(0, 60)}"`);
      }
      continue;
    }

    // 2. Fixed marker line
    if (MARKER_LINE.test(line)) continue;

    // 3. Category (first content line of the block)
    if (current.category === "") {
      const maybeSection = parseSectionLine(line);
      if (maybeSection) {
        // Malformed block with no category line — don't swallow the section.
        warnings.push(`Course ${current.courseCode}: category line missing in source.`);
        current.category = "UNKNOWN";
      } else {
        current.category = line;
        continue;
      }
    }

    // 4. Course name (second content line of the block)
    if (current.courseName === "") {
      const maybeSection = parseSectionLine(line);
      if (maybeSection) {
        warnings.push(`Course ${current.courseCode}: course name missing in source.`);
        current.courseName = current.courseCode;
      } else {
        current.courseName = line;
        continue;
      }
    }

    // 5. Section line
    const section = parseSectionLine(line);
    if (section) {
      flushSection();
      currentSection = {
        batch: section.batch,
        slotCode: section.slotCode,
        department: section.department,
        faculty: section.faculty,
        startDate: "",
        endDate: "",
        weeklyCells: [],
        weeklyHours: 0,
        selfPaced: false,
      };
      continue;
    }

    // 6. Date line
    const dateMatch = line.match(DATE_LINE_RE);
    if (dateMatch) {
      if (!currentSection) {
        warnings.push(`Date line without an open section (course ${current.courseCode}): "${line}"`);
        continue;
      }
      currentSection.startDate = ddmmyyyyToIso(dateMatch[1]);
      currentSection.endDate = ddmmyyyyToIso(dateMatch[2]);
      continue;
    }

    // 7. Day line(s)
    const dayMatch = line.match(DAY_LINE_RE);
    if (dayMatch) {
      const day = dayMatch[1][0].toUpperCase() + dayMatch[1].slice(1).toLowerCase();
      if (!currentSection) {
        warnings.push(`Day line without an open section (course ${current.courseCode}): "${line}"`);
        continue;
      }
      const cells = parseDayLine(dayMatch[2], day as Weekday);
      if (cells.length === 0) {
        warnings.push(
          `No parsable time ranges on "${line}" (${current.courseCode} ${currentSection.slotCode}).`
        );
      }
      currentSection.weeklyCells.push(...cells);
      continue;
    }

    // Anything else: tolerate and warn (wrapped text, stray headers, page furniture).
    warnings.push(
      `Unrecognized line in course ${current.courseCode}: "${line.slice(0, 60)}" — skipped.`
    );
  }
  flushCourse();

  // Post-process sections
  for (const course of byCode.values()) {
    for (const s of course.sections) {
      // Exact duplicate cells within one section are extraction artifacts
      // (repeated text runs in the PDF) — a section cannot meet the same
      // hour twice. De-duplicate and flag.
      const seenKeys = new Set<string>();
      const unique: typeof s.weeklyCells = [];
      for (const c of s.weeklyCells) {
        const k = `${c.day}|${c.startTime}|${c.endTime}`;
        if (!seenKeys.has(k)) {
          seenKeys.add(k);
          unique.push(c);
        }
      }
      if (unique.length < s.weeklyCells.length) {
        warnings.push(
          `${course.courseCode} ${s.slotCode}: ${s.weeklyCells.length - unique.length} duplicate time cell(s) removed — the PDF text layer repeated them. If this section still shows more hours than the real slot sheet, the file is two-column and a neighbour's blocks may have bled in; re-upload it (the extractor reconstructs columns) or paste corrected text.`
        );
      }
      s.weeklyCells = unique;
      s.weeklyHours = s.weeklyCells.length;
      s.selfPaced =
        s.weeklyCells.length === 0 || s.weeklyCells.every((c) => isPlaceholderCell(c));
      if (s.selfPaced && s.weeklyCells.length > 0) {
        warnings.push(
          `${course.courseCode} ${s.slotCode}: only short administrative time cells (e.g. 17:04 - 17:05) — treated as self-paced, no real time conflict.`
        );
      }
      if (!s.startDate || !s.endDate) {
        warnings.push(
          `${course.courseCode} ${s.slotCode}: missing date range — calendar export will use the term bound fallback.`
        );
      }
      if (s.faculty.length === 0) {
        warnings.push(`${course.courseCode} ${s.slotCode}: no faculty name parsed.`);
      }
      if (s.weeklyCells.some((c) => c.day === "Sunday")) {
        warnings.push(`${course.courseCode} ${s.slotCode}: has Sunday classes (grid shows Mon–Sat).`);
      }
    }
    if (course.sections.length === 0) {
      warnings.push(`Course ${course.courseCode} has no parsable sections.`);
    }
    if (course.courseName === "") {
      warnings.push(`Course ${course.courseCode}: course name missing in source.`);
      course.courseName = course.courseCode;
    }
    if (course.category === "") {
      warnings.push(`Course ${course.courseCode}: category missing in source.`);
      course.category = "UNKNOWN";
    }
    course.sectionMode = defaultSectionMode(course.sections);
  }

  return { courses: [...byCode.values()], warnings };
}
