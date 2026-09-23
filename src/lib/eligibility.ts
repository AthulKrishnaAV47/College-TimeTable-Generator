import type {
  Course,
  EligibilityRow,
  EligibilitySummary,
  EligibleSubject,
  StudentProfile,
} from "./types";

/** Normalize a course code for comparison (trim + uppercase). */
export function normCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * §3.2 — Eligible subjects =
 *   File A (offered this term) ∩ File B rows matching the student's year,
 *   minus the completed-course list.
 *
 * File B does not encode term information; the term filter is exactly
 * "appears in File A". Duplicated File B rows (same code at several year
 * levels) are preserved and matched per-year.
 */
export function buildEligibility(
  courses: Course[],
  rows: EligibilityRow[],
  profile: StudentProfile
): EligibilitySummary {
  const completed = new Set(profile.completedCourseCodes.map(normCode));

  // code → type for the student's year (preserve File A order)
  const typeByCode = new Map<string, "SBC" | "FC">();
  const allCodes = new Set<string>();
  for (const r of rows) {
    allCodes.add(r.courseCode);
    if (r.year === profile.year && !typeByCode.has(r.courseCode)) {
      typeByCode.set(r.courseCode, r.type);
    }
  }

  const sbc: EligibleSubject[] = [];
  const fc: EligibleSubject[] = [];
  const excludedByYear: string[] = [];
  const excludedByCompletion: { courseCode: string; type: "SBC" | "FC" }[] = [];
  const notInEligibilityTable: string[] = [];

  for (const course of courses) {
    const code = normCode(course.courseCode);
    const type = typeByCode.get(code);
    if (!type) {
      if (allCodes.has(code)) {
        excludedByYear.push(course.courseCode);
      } else {
        notInEligibilityTable.push(course.courseCode);
      }
      continue;
    }
    if (completed.has(code)) {
      excludedByCompletion.push({ courseCode: course.courseCode, type });
      continue;
    }
    (type === "SBC" ? sbc : fc).push({ ...course, type });
  }

  return { sbc, fc, excludedByYear, excludedByCompletion, notInEligibilityTable };
}
