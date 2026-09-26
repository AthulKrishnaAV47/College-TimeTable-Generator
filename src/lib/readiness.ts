import type { AutoSettings, AppState } from "./appState";
import type {
  Course,
  CoursePreferences,
  ScheduleConstraints,
  ScheduleSolution,
} from "./types";
import { normCode } from "./courseCodes";
import { requiredCourseCodes } from "./requirements";
import { placementSignature, solutionRuleViolations } from "./solver";

export interface ReadinessCheck {
  id: string;
  label: string;
  detail: string;
  status: "pass" | "review" | "blocked";
}
export interface ReadinessReport {
  checks: ReadinessCheck[];
  needsReview: boolean;
  blocked: boolean;
  dropped: string[];
}
export interface ReadinessInput {
  solution: ScheduleSolution | null;
  eligible: Course[];
  targets: AutoSettings;
  pinnedCourseCodes: string[];
  prefs: Record<string, CoursePreferences>;
  constraints: ScheduleConstraints;
  initialAutoCodes: string[];
  datasetSource: AppState["datasetSource"];
  /** ISO date, injected by tests; defaults to today's date in the browser. */
  today?: string;
}

export function buildReadiness(input: ReadinessInput): ReadinessReport {
  const { solution, targets, prefs } = input;
  const checks: ReadinessCheck[] = [];
  const add = (
    id: string,
    label: string,
    detail: string,
    status: ReadinessCheck["status"],
  ) => checks.push({ id, label, detail, status });
  const codes = Object.keys(solution?.placements ?? {}).map(normCode);
  const selected = new Set(codes);
  const courses = input.eligible.filter((c) =>
    selected.has(normCode(c.courseCode)),
  );
  const credits = courses.reduce((total, c) => total + c.credits, 0);
  const count = (type: string) =>
    courses.filter((c) => "type" in c && c.type === type).length;
  add(
    "schedule",
    "Conflict-free schedule",
    solution && codes.length
      ? "A solver solution exists. This is not an enrollment confirmation."
      : "Generate a conflict-free timetable before exporting.",
    solution && codes.length ? "pass" : "blocked",
  );
  const outside = codes.filter(
    (code) => !input.eligible.some((c) => normCode(c.courseCode) === code),
  );
  add(
    "eligibility",
    "Current eligibility",
    outside.length
      ? `Not currently eligible: ${outside.join(", ")}. Recalculate.`
      : "Selected subjects are in the completed-excluded eligibility pool.",
    outside.length ? "blocked" : "pass",
  );
  add(
    "subjects",
    "Subject count",
    `${codes.length} selected${targets.useCredits ? " (credit target mode)" : ` / target ${targets.targetCount}`}.`,
    targets.useCredits || codes.length === targets.targetCount
      ? "pass"
      : "review",
  );
  add(
    "credits",
    "Credit total",
    `${credits} credits${targets.useCredits ? ` / target at least ${targets.targetCredits}` : " (subject-count target mode)"}.`,
    targets.useCredits && credits < targets.targetCredits ? "review" : "pass",
  );
  for (const [type, minimum] of [
    ["SBC", targets.minSBC],
    ["FC", targets.minFC],
  ] as const) {
    add(
      type,
      `${type} minimum`,
      `${count(type)} selected / minimum ${minimum}.`,
      count(type) < minimum ? "review" : "pass",
    );
  }
  if (count("SBC") + count("FC") !== courses.length)
    add(
      "categories",
      "Course classifications",
      "Some courses have no SBC/FC classification. Check File B.",
      "review",
    );
  const missing = requiredCourseCodes(input.pinnedCourseCodes, prefs).filter(
    (code) => !selected.has(code),
  );
  const wrongLocks = Object.entries(prefs)
    .filter(([code, pref]) => {
      if (!pref.lockedPlacementId) return false;
      const placement = Object.values(solution?.placements ?? {}).find(
        (p) => normCode(p.courseCode) === normCode(code),
      );
      return (
        !placement ||
        placement.id !== pref.lockedPlacementId ||
        (pref.lockedPlacementSignature &&
          placementSignature(placement) !== pref.lockedPlacementSignature)
      );
    })
    .map(([code]) => code);
  add(
    "required",
    "Pins & section locks",
    missing.length || wrongLocks.length
      ? `Missing required courses: ${missing.join(", ") || "none"}. Unmet section locks: ${wrongLocks.join(", ") || "none"}.`
      : "All pinned courses and section locks are honored.",
    missing.length || wrongLocks.length ? "blocked" : "pass",
  );
  const dropped = [...new Set(input.initialAutoCodes.map(normCode))].filter(
    (code) => !selected.has(code),
  );
  add(
    "dropped",
    "Dropped from initial auto-selection",
    dropped.length ? dropped.join(", ") : "None.",
    dropped.length ? "review" : "pass",
  );
  const violations = solutionRuleViolations(
    solution?.placements ?? {},
    input.constraints,
  );
  add(
    "rules",
    "No-class rules",
    violations
      ? `${violations} scheduled period(s) violate excluded days/time windows. This is a relaxed schedule.`
      : "No selected periods violate your rules.",
    violations ? "review" : "pass",
  );
  const sections = Object.values(solution?.placements ?? {}).flatMap(
    (p) => p.sections,
  );
  const validDate = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  const invalidDates =
    !sections.length ||
    sections.some(
      (s) =>
        !validDate(s.startDate) ||
        !validDate(s.endDate) ||
        s.startDate > s.endDate,
    );
  const start = sections.map((s) => s.startDate).sort()[0];
  const end = sections
    .map((s) => s.endDate)
    .sort()
    .at(-1);
  const now = new Date();
  const today =
    input.today ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const expired = sections.some((s) => s.endDate < today);
  add(
    "dates",
    "Selected section dates",
    invalidDates
      ? "Missing or invalid section dates. Check the term export."
      : `${start} → ${end}.${expired ? " Some section dates have already ended." : " Confirm these match your intended term."}`,
    invalidDates ? "blocked" : expired ? "review" : "pass",
  );
  const source = input.datasetSource;
  add(
    "dataset",
    "Dataset source & last known update",
    source
      ? `${source.label} · updated ${source.updatedAt ?? "unknown"} · loaded ${source.loadedAt}. This is a snapshot, not a live freshness check.`
      : "Local/imported files — source update time unknown. Verify against the current official term files.",
    source?.updatedAt ? "pass" : "review",
  );
  return {
    checks,
    needsReview: checks.some((c) => c.status !== "pass"),
    blocked: checks.some((c) => c.status === "blocked"),
    dropped,
  };
}
