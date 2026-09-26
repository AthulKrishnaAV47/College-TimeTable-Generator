import type {
  Course,
  EligibilityRow,
  EligibilitySummary,
  EligibleSubject,
  StudentProfile,
} from "./types";

import { normCode, resolveCourseCode } from "./courseCodes";
export { normCode } from "./courseCodes";

/**
 * §3.2 — Eligible subjects =
 *   File A (offered this term) ∩ File B rows matching the student's year,
 *   minus the completed-course list.
 *
 * Year II & III students can also enroll in Year I subjects: their filter
 * matches File B rows for BOTH "II & III" and "I". When a code carries rows
 * for both year levels, the student's own-year row is authoritative for the
 * SBC/FC classification.
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
  const completed = new Set(profile.completedCourseCodes.map(c => resolveCourseCode(c, courses) ?? normCode(c)));

  // code → type for the student's year (preserve File A order)
  const typeByCode = new Map<string, "SBC" | "FC">();
  const allCodes = new Set<string>();
  // Pass 1: the student's own year rows (authoritative on conflicts).
  for (const r of rows) {
    allCodes.add(normCode(r.courseCode));
    if (r.year === profile.year) {
      typeByCode.set(normCode(r.courseCode), r.type);
    }
  }
  // Pass 2: Year II & III also inherit Year I rows for codes not already
  // classified at their own level.
  if (profile.year === "II & III") {
    for (const r of rows) {
      if (r.year === "I" && !typeByCode.has(normCode(r.courseCode))) {
        typeByCode.set(normCode(r.courseCode), r.type);
      }
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
