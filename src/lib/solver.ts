import {
  type BlockingPair,
  type Course,
  type CoursePreferences,
  type Placement,
  type RankPreference,
  type ScheduleSolution,
  type SolverFailure,
  type SolverResult,
  type TimeCell,
} from "./types";
import { cellsOverlap, isPlaceholderCell, timeToMinutes } from "./time";
import { normCode } from "./eligibility";

/* ------------------------------------------------------------------ */
/* Placement building (§3.4)                                           */
/* ------------------------------------------------------------------ */

/**
 * Candidate placements for one course.
 *  - "alternative"      → one placement per section (pick exactly one).
 *  - "mandatory-combo"  → a single placement containing all sections, which
 *                         must be taken together as one package.
 * A combo whose own sections overlap each other yields zero placements
 * (impossible to attend).
 */
export function buildPlacements(course: Course, prefs: CoursePreferences): Placement[] {
  if (course.sections.length === 0) return [];
  if (prefs.sectionMode === "mandatory-combo") {
    const all = course.sections;
    const busy = mergeBusy(all);
    if (busy === null) return [];
    return [
      {
        id: `${course.courseCode}::combo`,
        courseCode: course.courseCode,
        sections: all,
        busy,
      },
    ];
  }
  return course.sections.map((s, i) => ({
    id: `${course.courseCode}::${s.slotCode}${dupGuard(course.sections, s.slotCode, i)}`,
    courseCode: course.courseCode,
    sections: [s],
    busy: realCells([s]),
  }));
}

function dupGuard(sections: { slotCode: string }[], slotCode: string, index: number): string {
  const first = sections.findIndex((s) => s.slotCode === slotCode);
  return first === index ? "" : `#${index + 1}`;
}

/** All non-placeholder cells across sections (1-hour granularity). */
export function realCells(sections: { weeklyCells: TimeCell[] }[]): TimeCell[] {
  return sections.flatMap((s) => s.weeklyCells.filter((c) => !isPlaceholderCell(c)));
}

/**
 * Merge a set of sections into one busy list. Returns null when the package
 * is internally impossible (two of its own sections overlap — the student
 * cannot attend both).
 */
function mergeBusy(sections: { weeklyCells: TimeCell[] }[]): TimeCell[] | null {
  const cells = realCells(sections);
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      if (cellsOverlap(cells[i], cells[j])) return null;
    }
  }
  return cells;
}

/**
 * Placements for every course, plus the reason a course has no valid
 * placement at all (e.g. a self-overlapping mandatory combo).
 */
export function buildAllPlacements(
  courses: Course[],
  prefs: Record<string, CoursePreferences>
): { placements: Map<string, Placement[]>; impossible: { courseCode: string; reason: string }[] } {
  const placements = new Map<string, Placement[]>();
  const impossible: { courseCode: string; reason: string }[] = [];
  for (const course of courses) {
    const code = normCode(course.courseCode);
    const p = prefs[code] ?? {
      sectionMode: course.sectionMode,
      preferredFaculty: null,
    };
    const built = buildPlacements(course, p);
    if (built.length === 0) {
      impossible.push({
        courseCode: course.courseCode,
        reason:
          course.sections.length === 0
            ? "no sections were parsed for this course"
            : "its mandatory combo contains two sections that overlap each other",
      });
    }
    placements.set(code, built);
  }
  return { placements, impossible };
}

/* ------------------------------------------------------------------ */
/* Backtracking search with MRV (§3.5)                                 */
/* ------------------------------------------------------------------ */

interface SearchNode {
  courseCodes: string[]; // fixed course order
  options: Map<string, Placement[]>;
  assignment: Map<string, Placement>;
  /** flat list of busy cells already committed (interval collision checks) */
  busyCells: TimeCell[];
}

function placementFits(p: Placement, busyCells: TimeCell[]): boolean {
  for (const c of p.busy) {
    for (const o of busyCells) {
      if (cellsOverlap(c, o)) return false;
    }
  }
  return true;
}

function orderPlacement(p: Placement, pref: string | null): number {
  // Preferred faculty first (soft preference), then fewer weekly hours.
  const hit =
    pref && p.sections.some((s) => s.faculty.some((f) => f.toLowerCase() === pref.toLowerCase()))
      ? 0
      : 1;
  return hit * 1000 + p.busy.length;
}

export function solve(
  courses: Course[],
  prefs: Record<string, CoursePreferences>,
  options: { maxSolutions?: number; maxNodes?: number; rankBy?: RankPreference } = {}
): SolverResult {
  const maxSolutions = options.maxSolutions ?? 50;
  const maxNodes = options.maxNodes ?? 200_000;
  const rankBy = options.rankBy ?? "fewest-gaps";

  const courseCodes = courses.map((c) => normCode(c.courseCode));
  const prefByCode = new Map<string, CoursePreferences>();
  for (const c of courses) {
    const code = normCode(c.courseCode);
    prefByCode.set(code, prefs[code] ?? { sectionMode: c.sectionMode, preferredFaculty: null });
  }

  const { placements: optionsByCode, impossible } = buildAllPlacements(courses, prefs);

  if (impossible.length > 0) {
    return noSolutionResult(courses, optionsByCode, impossible);
  }

  const node: SearchNode = {
    courseCodes,
    options: optionsByCode,
    assignment: new Map(),
    busyCells: [],
  };

  const solutions: ScheduleSolution[] = [];
  const seen = new Set<string>();
  let nodes = 0;
  let truncated = false;

  const recordSolution = (): void => {
    const assignment: Record<string, string> = {};
    const placements: Record<string, Placement> = {};
    const sigParts: string[] = [];
    for (const code of courseCodes) {
      const p = node.assignment.get(code)!;
      assignment[code] = p.id;
      placements[code] = p;
      sigParts.push(`${code}=${p.id}`);
    }
    const sig = sigParts.join("|");
    if (seen.has(sig)) return;
    seen.add(sig);
    const metrics = computeMetrics(courseCodes.map((c) => placements[c]), prefByCode);
    solutions.push({
      assignment,
      placements,
      metrics,
      score: scoreSolution(metrics, rankBy),
    });
  };

  // MRV backtracking
  const search = (): "done" | "budget" => {
    if (nodes++ > maxNodes) {
      truncated = true;
      return "budget";
    }
    // Pick the unassigned course with the fewest consistent options (MRV):
    // most-constrained-first prunes the tree fastest.
    let bestCode: string | null = null;
    let bestConsistent: Placement[] = [];
    for (const code of node.courseCodes) {
      if (node.assignment.has(code)) continue;
      const opts = node.options.get(code) ?? [];
      const consistent = opts.filter((p) => placementFits(p, node.busyCells));
      if (consistent.length === 0) return "done"; // dead end → backtrack
      if (bestCode === null || consistent.length < bestConsistent.length) {
        bestCode = code;
        bestConsistent = consistent;
      }
    }
    if (bestCode === null) {
      // All assigned → record and keep exploring for more solutions.
      recordSolution();
      return solutions.length >= maxSolutions ? "budget" : "done";
    }
    const pref = prefByCode.get(bestCode)?.preferredFaculty ?? null;
    const ordered = [...bestConsistent].sort(
      (a, b) => orderPlacement(a, pref) - orderPlacement(b, pref)
    );
    for (const p of ordered) {
      node.assignment.set(bestCode, p);
      node.busyCells.push(...p.busy);
      const r = search();
      if (r === "budget") return "budget";
      node.busyCells.length -= p.busy.length;
      node.assignment.delete(bestCode);
    }
    return "done";
  };

  search();

  if (solutions.length === 0) {
    return noSolutionResult(courses, optionsByCode, impossible);
  }
  solutions.sort((a, b) => a.score - b.score);
  return { ok: true, solutions, truncated, nodesExplored: nodes };
}

/* ------------------------------------------------------------------ */
/* Metrics & ranking                                                   */
/* ------------------------------------------------------------------ */

export function computeMetrics(
  placements: Placement[],
  prefs?: Map<string, CoursePreferences>
): ScheduleSolution["metrics"] {
  const cells = placements.flatMap((p) => p.busy);
  const days = new Set(cells.map((c) => c.day));
  let totalGaps = 0;
  let earliest: string | null = null;
  let latest: string | null = null;
  for (const day of [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ] as const) {
    const dayCells = cells
      .filter((c) => c.day === day)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    if (dayCells.length === 0) continue;
    const start = timeToMinutes(dayCells[0].startTime);
    const end = timeToMinutes(dayCells[dayCells.length - 1].endTime);
    if (earliest === null || start < timeToMinutes(earliest)) earliest = dayCells[0].startTime;
    if (latest === null || end > timeToMinutes(latest)) latest = dayCells[dayCells.length - 1].endTime;
    for (let i = 1; i < dayCells.length; i++) {
      const gap = timeToMinutes(dayCells[i].startTime) - timeToMinutes(dayCells[i - 1].endTime);
      if (gap > 0) totalGaps += gap;
    }
  }
  const daysWithClasses = [...days].filter((d) => d !== "Sunday").length;
  let preferredFacultyHits = 0;
  if (prefs) {
    for (const p of placements) {
      const pref = prefs.get(p.courseCode)?.preferredFaculty;
      if (pref && p.sections.some((s) => s.faculty.includes(pref))) preferredFacultyHits++;
    }
  }
  return {
    weeklyContactHours: cells.length,
    daysWithClasses,
    freeDays: Math.max(0, 6 - daysWithClasses),
    totalGaps: Math.round((totalGaps / 60) * 100) / 100,
    earliestStart: earliest,
    latestEnd: latest,
    preferredFacultyHits,
  };
}

export function scoreSolution(m: ScheduleSolution["metrics"], rankBy: RankPreference): number {
  // Lower score = better. Primary criterion scaled large, secondary ×100.
  const gaps = m.totalGaps;
  const days = m.daysWithClasses;
  const latest = m.latestEnd ? timeToMinutes(m.latestEnd) : 0;
  const hits = m.preferredFacultyHits;
  switch (rankBy) {
    case "most-free-days":
      return days * 10_000 + gaps * 100;
    case "earliest-finish":
      return latest * 100 + gaps * 10;
    case "preferred-faculty":
      return -hits * 100_000 + gaps * 100 + days * 10;
    case "fewest-gaps":
    default:
      return gaps * 10_000 + days * 100 + latest;
  }
}

/* ------------------------------------------------------------------ */
/* No-solution diagnostics                                             */
/* ------------------------------------------------------------------ */

function pairCompatible(a: Placement[], b: Placement[]): boolean {
  for (const pa of a) {
    for (const pb of b) {
      if (pa.busy.every((ca) => pb.busy.every((cb) => !cellsOverlap(ca, cb)))) return true;
    }
  }
  return false;
}

function noSolutionResult(
  courses: Course[],
  optionsByCode: Map<string, Placement[]>,
  impossible: { courseCode: string; reason: string }[]
): SolverFailure {
  const codes = courses.map((c) => normCode(c.courseCode));
  const impossibleCourses: { courseCode: string; reason: string }[] = [...impossible];
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    if (
      (optionsByCode.get(code)?.length ?? 0) === 0 &&
      !impossibleCourses.some((x) => normCode(x.courseCode) === code)
    ) {
      impossibleCourses.push({
        courseCode: courses[i].courseCode,
        reason: "has no candidate sections to place",
      });
    }
  }

  const blockingPairs: BlockingPair[] = [];
  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const a = optionsByCode.get(codes[i]) ?? [];
      const b = optionsByCode.get(codes[j]) ?? [];
      if (a.length === 0 || b.length === 0) continue; // covered by impossibleCourses
      if (!pairCompatible(a, b)) {
        blockingPairs.push({
          courseA: courses[i].courseCode,
          courseB: courses[j].courseCode,
          reason: `every ${courses[i].courseCode} section overlaps every ${courses[j].courseCode} section`,
        });
      }
    }
  }

  const parts: string[] = [];
  if (impossibleCourses.length > 0) {
    parts.push(
      impossibleCourses.map((c) => `${c.courseCode} (${c.reason})`).join(", ") +
        " cannot be scheduled at all"
    );
  }
  if (blockingPairs.length > 0) {
    parts.push(
      blockingPairs
        .map((p) => `${p.courseA} and ${p.courseB} have no non-overlapping section pair`)
        .join("; ")
    );
  }
  const message =
    parts.length > 0
      ? `No conflict-free timetable exists for this selection: ${parts.join(". ")}.`
      : "No conflict-free timetable exists for this selection. Try dropping a subject or changing a mandatory/alternative toggle.";

  return { ok: false, reason: "no-solution", impossibleCourses, blockingPairs, message };
}

/* ------------------------------------------------------------------ */
/* Auto subject selection (§3.3 auto + §3.5 auto paragraph)             */
/* ------------------------------------------------------------------ */

export interface AutoSelectOptions {
  /** desired number of subjects (overrides targetCredits when set) */
  targetCount?: number | null;
  /** desired total credits */
  targetCredits?: number | null;
  /** minimum SBC subjects to include */
  minSBC?: number;
  /** minimum FC subjects to include */
  minFC?: number;
  /** solver retry budget (default 30) */
  maxAttempts?: number;
  rankBy?: RankPreference;
}

export interface AutoSelectResult {
  ok: boolean;
  chosen: Course[];
  solution: ScheduleSolution | null;
  failure: SolverFailure | null;
  attempts: { selected: string[]; outcome: "sat" | "unsat"; note: string }[];
}

interface Candidate {
  course: Course & { type?: "SBC" | "FC" };
  code: string;
  optionCount: number;
}

/**
 * Wraps the solver: try the highest-value subject subset first; if
 * unsatisfiable, swap/drop one subject at a time (dropping the subject with
 * the fewest section options first — it's the likeliest bottleneck) and
 * re-run, up to a retry budget.
 */
export function autoSelectCourses(
  eligible: Course[],
  prefs: Record<string, CoursePreferences>,
  options: AutoSelectOptions
): AutoSelectResult {
  const attempts: AutoSelectResult["attempts"] = [];
  const maxAttempts = options.maxAttempts ?? 30;

  const candidates: Candidate[] = eligible.map((c) => {
    const code = normCode(c.courseCode);
    const mode = prefs[code]?.sectionMode ?? c.sectionMode;
    return {
      course: c as Course & { type?: "SBC" | "FC" },
      code,
      optionCount: mode === "mandatory-combo" ? 1 : c.sections.length,
    };
  });

  const isSbc = (c: Candidate) => c.course.type === "SBC";
  const sortByValue = (arr: Candidate[]) =>
    [...arr].sort((a, b) => b.course.credits - a.course.credits || b.optionCount - a.optionCount);

  const minSBC = Math.max(0, options.minSBC ?? 0);
  const minFC = Math.max(0, options.minFC ?? 0);
  const sbcPool = sortByValue(candidates.filter(isSbc));
  const fcPool = sortByValue(candidates.filter((c) => !isSbc(c)));

  const pickInitial = (count: number | null, creditTarget: number | null): Candidate[] => {
    const chosen: Candidate[] = [];
    const used = new Set<string>();
    const take = (pool: Candidate[], n: number) => {
      for (const c of pool) {
        if (n <= 0) break;
        if (used.has(c.code)) continue;
        chosen.push(c);
        used.add(c.code);
        n--;
      }
    };
    take(sbcPool, minSBC);
    take(fcPool, minFC);
    for (const c of sortByValue(candidates.filter((x) => !used.has(x.code)))) {
      if (count !== null && chosen.length >= count) break;
      if (count === null && creditTarget !== null) {
        const total = chosen.reduce((s, x) => s + x.course.credits, 0);
        if (total >= creditTarget) break;
      }
      chosen.push(c);
      used.add(c.code);
    }
    return chosen;
  };

  const countTarget = options.targetCount ?? null;
  const creditTarget = options.targetCredits ?? null;

  let current: Candidate[] =
    countTarget !== null || creditTarget !== null
      ? pickInitial(countTarget, creditTarget)
      : [...candidates];

  if (current.length === 0) {
    return { ok: false, chosen: [], solution: null, failure: null, attempts };
  }

  let lastFailure: SolverFailure | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const courses = current.map((c) => c.course);
    const result = solve(courses, prefs, { rankBy: options.rankBy, maxSolutions: 20 });
    const codes = courses.map((c) => c.courseCode);
    if (result.ok && result.solutions.length > 0) {
      attempts.push({ selected: codes, outcome: "sat", note: `attempt ${attempt + 1}` });
      return { ok: true, chosen: courses, solution: result.solutions[0], failure: null, attempts };
    }
    lastFailure = result.ok ? null : result;
    attempts.push({
      selected: codes,
      outcome: "unsat",
      note:
        result.ok
          ? ""
          : result.blockingPairs.length > 0
            ? `${result.blockingPairs[0].courseA} ↔ ${result.blockingPairs[0].courseB}`
            : "no valid placement",
    });

    // Repair: drop the most constrained chosen subject (fewest options; tie →
    // fewest credits — least valuable anyway) and swap in the next candidate
    // of the same SBC/FC category when one exists.
    const byConstrainedness = [...current].sort(
      (a, b) => a.optionCount - b.optionCount || a.course.credits - b.course.credits
    );
    let repaired = false;
    for (const victim of byConstrainedness) {
      const victimIsSbc = isSbc(victim);
      const remainingSbc = current.filter((c) => c !== victim && isSbc(c)).length;
      const remainingFc = current.filter((c) => c !== victim && !isSbc(c)).length;
      if (victimIsSbc && remainingSbc < minSBC) continue;
      if (!victimIsSbc && remainingFc < minFC) continue;

      const pool = sortByValue(
        candidates.filter(
          (c) => !current.includes(c) && (isSbc(c) ? victimIsSbc : !victimIsSbc)
        )
      );
      const replacement = pool.find((c) => c.optionCount > victim.optionCount);
      const idx = current.indexOf(victim);
      if (replacement) {
        current = [...current.slice(0, idx), replacement, ...current.slice(idx + 1)];
      } else {
        current = current.filter((c) => c !== victim);
      }
      repaired = true;
      break;
    }
    if (!repaired || current.length === 0) break;
  }

  return { ok: false, chosen: [], solution: null, failure: lastFailure, attempts };
}
