import type { CoursePreferences, SolverFailure } from "./types";
import { normCode } from "./courseCodes";

/** A section lock also makes its course non-droppable. Neither overrides eligibility. */
export function requiredCourseCodes(
  pinned: string[] = [],
  prefs: Record<string, CoursePreferences> = {},
): string[] {
  return [
    ...new Set(
      [
        ...pinned,
        ...Object.keys(prefs).filter((code) => prefs[code].lockedPlacementId),
      ].map(normCode),
    ),
  ];
}

export function missingRequiredFailure(
  required: string[],
  available: string[],
): SolverFailure | null {
  const pool = new Set(available.map(normCode));
  const missing = required.filter((code) => !pool.has(normCode(code)));
  if (!missing.length) return null;
  return {
    ok: false,
    reason: "no-solution",
    blockingPairs: [],
    nearMisses: [],
    impossibleCourses: missing.map((courseCode) => ({
      courseCode,
      reason:
        "Pinned or section-locked course is not eligible/selected. Remove the pin or lock explicitly, or correct the profile/dataset.",
    })),
    message: `Required courses unavailable: ${missing.join(", ")}. Pins and locks never override completed-course or year exclusions.`,
  };
}
