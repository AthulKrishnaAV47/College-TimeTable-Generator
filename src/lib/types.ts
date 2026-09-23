/**
 * Core domain types for the MyCamu term-timetable generator.
 * Mirrors the data model proposed in the product spec (§4).
 */

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** One 1-hour (or shorter, for placeholders) weekly period on a specific day. */
export interface TimeCell {
  day: Weekday;
  /** "HH:MM" 24h */
  startTime: string;
  /** "HH:MM" 24h */
  endTime: string;
}

export interface Section {
  /** e.g. "UG - 04" */
  batch: string;
  /** e.g. "T1-P3" */
  slotCode: string;
  /** e.g. "AI" */
  department: string;
  /** one or more faculty names */
  faculty: string[];
  /** ISO date "YYYY-MM-DD" */
  startDate: string;
  /** ISO date "YYYY-MM-DD" */
  endDate: string;
  /** individual cells at 1-hour granularity (kept un-merged for conflict checks) */
  weeklyCells: TimeCell[];
  /** derived: weeklyCells.length */
  weeklyHours: number;
  /**
   * True when every cell of this section is an administrative placeholder
   * (e.g. "Wednesday: 17:04 - 17:05" on self-paced courses like
   * Environmental Sciences). Placeholder sections neither consume grid space
   * nor take part in conflict checks.
   */
  selfPaced: boolean;
}

export type SectionMode = "alternative" | "mandatory-combo";

export interface Course {
  courseCode: string; // "19AI305" or non-standard "QNX RTOS"
  credits: number;
  /** raw category string, e.g. "ENGINEERING SCIENCES - ENGINEERING SCIENCES" */
  category: string;
  courseName: string;
  sections: Section[];
  /** user-confirmed (heuristic default) — see §3.4 */
  sectionMode: SectionMode;
}

export type EligibilityType = "SBC" | "FC";
export type EligibilityYear = "I" | "II & III";

export interface EligibilityRow {
  courseCode: string;
  type: EligibilityType;
  year: EligibilityYear;
}

export type StudentYear = EligibilityYear;

export interface StudentProfile {
  year: StudentYear;
  /** free text, e.g. "Year I - Term 2" */
  termLabel: string;
  completedCourseCodes: string[];
}

/** A faculty name attached to a section, for preference ranking. */
export interface CoursePreferences {
  /**
   * "alternative" → each section is a candidate; "mandatory-combo" → all
   * sections must be taken together as a single package.
   */
  sectionMode: SectionMode;
  /** Soft preference used for ranking solutions. Empty = no preference. */
  preferredFaculty: string | null;
}

/* ------------------------------------------------------------------ */
/* Scheduling                                                          */
/* ------------------------------------------------------------------ */

/** One candidate "placement" for a course: the section(s) the student attends. */
export interface Placement {
  /** stable id, e.g. "19AI305::T1-P3" or "19AI305::COMBO" */
  id: string;
  courseCode: string;
  /** 1 for alternatives, all sections for a mandatory combo */
  sections: Section[];
  /** merged busy cells (1-hour granularity, placeholders excluded) */
  busy: TimeCell[];
}

export interface SolverOptions {
  /** stop collecting solutions after this many (default 50) */
  maxSolutions?: number;
  /** hard node budget to bound pathological searches (default 200_000) */
  maxNodes?: number;
  /** ranking preference */
  rankBy?: RankPreference;
}

export type RankPreference = "fewest-gaps" | "most-free-days" | "earliest-finish" | "preferred-faculty";

export interface SolutionMetrics {
  /** total 1-hour cells per week */
  weeklyContactHours: number;
  /** distinct weekdays with classes */
  daysWithClasses: number;
  /** count of Mon-Sat days without classes (excludes Sunday) */
  freeDays: number;
  /** sum of idle hours between consecutive classes, over all days */
  totalGaps: number;
  /** "HH:MM" of the earliest class, or null */
  earliestStart: string | null;
  /** "HH:MM" of the latest class end, or null */
  latestEnd: string | null;
  /** how many courses got their preferred faculty (when set) */
  preferredFacultyHits: number;
}

export interface ScheduleSolution {
  /** placement id per course code */
  assignment: Record<string, string>;
  /** resolved placements per course code */
  placements: Record<string, Placement>;
  metrics: SolutionMetrics;
  /** ranking score — lower is better */
  score: number;
}

export interface BlockingPair {
  courseA: string;
  courseB: string;
  reason: string;
}

export interface SolverFailure {
  ok: false;
  reason: "no-solution";
  /** single courses that cannot be placed at all (e.g. self-overlapping combo) */
  impossibleCourses: { courseCode: string; reason: string }[];
  /** pairs of courses with zero mutually-compatible placements */
  blockingPairs: BlockingPair[];
  message: string;
}

export type SolverResult =
  | { ok: true; solutions: ScheduleSolution[]; truncated: boolean; nodesExplored: number }
  | SolverFailure;

/* ------------------------------------------------------------------ */
/* Parsing results                                                     */
/* ------------------------------------------------------------------ */

export interface SlotSheetParseResult {
  courses: Course[];
  warnings: string[];
}

export interface EligibilityParseResult {
  rows: EligibilityRow[];
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Eligibility                                                         */
/* ------------------------------------------------------------------ */

export interface EligibleSubject extends Course {
  type: EligibilityType;
}

export interface EligibilitySummary {
  sbc: EligibleSubject[];
  fc: EligibleSubject[];
  /** course codes offered this term but NOT eligible for the chosen year */
  excludedByYear: string[];
  /** course codes excluded because already completed */
  excludedByCompletion: { courseCode: string; type: EligibilityType }[];
  /** File A courses with no File B row at all */
  notInEligibilityTable: string[];
}

/* ------------------------------------------------------------------ */
/* Drafts                                                              */
/* ------------------------------------------------------------------ */

export interface DraftSnapshot {
  id: string;
  label: string;
  createdAt: string;
  profile: StudentProfile;
  /** course code → chosen placement ids + section modes at save time */
  courseChoices: {
    courseCode: string;
    courseName: string;
    credits: number;
    type: EligibilityType;
    placementId: string;
    sectionMode: SectionMode;
  }[];
  metrics: SolutionMetrics;
  /** fully resolved placements so drafts render without re-parsing */
  placements: Record<string, Placement>;
}
