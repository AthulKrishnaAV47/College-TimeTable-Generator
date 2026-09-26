import type {
  Course,
  EligibilityRow,
  NearMissSchedule,
  RankPreference,
  ScheduleConstraints,
  ScheduleSolution,
  SolveOutcome,
  SolverFailure,
  StudentProfile,
  CoursePreferences,
} from "./types";

/** Wizard/session state shared between the step components. */

export interface ParsedSlotSheet {
  text: string;
  courses: Course[];
  warnings: string[];
}

export interface ParsedEligibility {
  text: string;
  rows: EligibilityRow[];
  warnings: string[];
}

export type Mode = "manual" | "auto";

export interface AutoSettings {
  targetCount: number;
  targetCredits: number;
  useCredits: boolean;
  minSBC: number;
  minFC: number;
}

export interface AppState {
  pinnedCourseCodes: string[];
  autoInitialCourseCodes: string[];
  datasetSource: { label: string; updatedAt: string | null; loadedAt: string } | null;
  termDatasetId?: string | null;
  step: number;
  slotSheet: ParsedSlotSheet | null;
  eligibility: ParsedEligibility | null;
  profile: StudentProfile;
  mode: Mode;
  manualPicks: Record<string, boolean>;
  autoSettings: AutoSettings;
  autoChosen: string[] | null;
  autoLog: { selected: string[]; outcome: "sat" | "unsat"; note: string }[] | null;
  coursePrefs: Record<string, CoursePreferences>;
  /** hard no-class rules: excluded days and time windows */
  constraints: ScheduleConstraints;
  rankBy: RankPreference;
  solutions: ScheduleSolution[] | null;
  solutionIdx: number;
  truncatedSearch: boolean;
  failure: SolverFailure | null;
  /** how the solver handled the no-class rules for the last search */
  solveOutcome: SolveOutcome | null;
  /** renderable best-effort schedule when outcome === "impossible" */
  nearMiss: NearMissSchedule | null;
  /** caution message set if AI replaced a course */
  aiMessage?: string | null;
}

export const DEFAULT_STATE: AppState = {
  pinnedCourseCodes: [],
  autoInitialCourseCodes: [],
  datasetSource: null,
  step: 0,
  slotSheet: null,
  eligibility: null,
  profile: { year: "I", termLabel: "Year I - Term 2", completedCourseCodes: [] },
  mode: "manual",
  manualPicks: {},
  autoSettings: { targetCount: 5, targetCredits: 18, useCredits: false, minSBC: 1, minFC: 3 },
  autoChosen: null,
  autoLog: null,
  coursePrefs: {},
  constraints: { excludedDays: [], excludedRanges: [] },
  rankBy: "fewest-gaps",
  solutions: null,
  solutionIdx: 0,
  truncatedSearch: false,
  failure: null,
  solveOutcome: null,
  nearMiss: null,
};

export const STEPS = [
  "Slot sheet & rules",
  "Your profile",
  "Subjects",
  "Sections",
  "Timetable",
  "Drafts & compare",
] as const;
