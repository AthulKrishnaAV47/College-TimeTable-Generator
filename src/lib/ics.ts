import type { Placement, StudentProfile } from "./types";
import { firstOccurrence, mergeCells, addDaysIso, isPlaceholderCell } from "./time";

/**
 * ICS (RFC 5545) calendar export (§3.6): one recurring weekly VEVENT per
 * real class block, repeating between the section's startDate and endDate
 * from the slot sheet. Floating local times are used (no TZID), which
 * Google/Apple Calendar interpret in the calendar's own timezone.
 */

const DAY_ICAL: Record<string, string> = {
  Monday: "MO",
  Tuesday: "TU",
  Wednesday: "WE",
  Thursday: "TH",
  Friday: "FR",
  Saturday: "SA",
  Sunday: "SU",
};

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Fold content lines at 75 octets per RFC 5545 §3.1. */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const out: string[] = [];
  let rest = line;
  out.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 0) {
    out.push(" " + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  return out.join("\r\n");
}

function uid(seed: string): string {
  return `${seed.replace(/[^A-Za-z0-9]/g, "-")}@college-timetable-generator`;
}

export interface IcsEntry {
  placement: Placement;
  courseName: string;
}

export function buildIcs(
  entries: IcsEntry[],
  profile: StudentProfile,
  opts: { fallbackStart?: string; fallbackEnd?: string } = {}
): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const calName = profile.termLabel || "Term Timetable";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//College Timetable Generator//MyCamu Term Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${icsEscape(calName)}`),
  ];

  for (const { placement, courseName } of entries) {
    for (const section of placement.sections) {
      const real = section.weeklyCells.filter((c) => !isPlaceholderCell(c));
      if (real.length === 0) continue; // self-paced placeholder sections → no calendar junk
      const merged = mergeCells(real);
      const start = section.startDate || opts.fallbackStart || "";
      const end = section.endDate || opts.fallbackEnd || addDaysIso(start || "2026-01-01", 60);
      for (const block of merged) {
        const first = start ? firstOccurrence(start, block.day) : null;
        if (!first) continue;
        const until = end.replace(/-/g, "") + "T235959";
        const faculty = section.faculty.join(", ");
        lines.push("BEGIN:VEVENT");
        lines.push(
          fold(`UID:${uid(`${placement.courseCode}-${section.slotCode}-${block.day}-${block.startTime}`)}`)
        );
        lines.push(`DTSTAMP:${stamp}`);
        lines.push(`DTSTART:${first.replace(/-/g, "")}T${block.startTime.replace(":", "")}00`);
        lines.push(`DTEND:${first.replace(/-/g, "")}T${block.endTime.replace(":", "")}00`);
        lines.push(`RRULE:FREQ=WEEKLY;UNTIL=${until};BYDAY=${DAY_ICAL[block.day]}`);
        lines.push(fold(`SUMMARY:${icsEscape(`${placement.courseCode} ${courseName}`.trim())}`));
        lines.push(
          fold(
            `DESCRIPTION:${icsEscape(
              [
                `${placement.courseCode} — ${courseName}`,
                `Section ${section.slotCode} (${section.batch})`,
                faculty ? `Faculty: ${faculty}` : null,
                profile.termLabel,
              ]
                .filter(Boolean)
                .join("\n")
            )}`
          )
        );
        lines.push(fold(`LOCATION:${icsEscape(`${section.batch} / ${section.slotCode}`)}`));
        lines.push("END:VEVENT");
      }
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
