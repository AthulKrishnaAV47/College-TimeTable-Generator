import type { Course } from "./types";

export const normCode = (value: string) => value.normalize("NFKC").trim().toUpperCase().replace(/\s+/g, " ");
const key = (value: string) => normCode(value).replace(/[^A-Z0-9]/g, "");
const insignificant = new Set(["AND", "OF", "THE", "IN", "TO", "FOR", "A", "AN"]);
const seededAliases: Record<string, string[]> = { "19AI303": ["EMPD"] };

/** Exact code wins; names/initials/curated aliases must identify exactly one course.
 * No edit-distance guessing: a false completion would hide an eligible course. */
export function resolveCourseCode(input: string, courses: Course[]): string | null {
  const query = key(input);
  if (!query) return null;
  const direct = courses.filter(c => key(c.courseCode) === query);
  if (direct.length === 1) return normCode(direct[0].courseCode);
  const matches = courses.filter(c => {
    const words = normCode(c.courseName).match(/[A-Z0-9]+/g) ?? [];
    const initials = words.filter(w => !insignificant.has(w)).map(w => w[0]).join("");
    return [c.courseName, initials, ...(c.aliases ?? []), ...(seededAliases[normCode(c.courseCode)] ?? [])]
      .some(alias => key(alias) === query);
  });
  return matches.length === 1 ? normCode(matches[0].courseCode) : null;
}

export function resolveCompleted(inputs: string[], courses: Course[]) {
  const codes: string[] = [], unmatched: string[] = [];
  for (const input of inputs.filter(s => s.trim())) {
    const code = resolveCourseCode(input, courses);
    if (code) codes.push(code); else unmatched.push(input);
  }
  return { codes: [...new Set(codes)], unmatched };
}

export function matchesCourseSearch(course: Course, input: string, courses: Course[]) {
  const resolved = resolveCourseCode(input, courses);
  return resolved === normCode(course.courseCode) ||
    normCode(`${course.courseCode} ${course.courseName}`).includes(normCode(input));
}

/** Always enforced, including production: never widen the eligible pool on retry. */
export function assertEligiblePool(candidates: Course[], eligible: Course[], completed: string[] = []) {
  const allowed = new Set(eligible.map(c => normCode(c.courseCode)));
  const excluded = new Set(completed.map(c => resolveCourseCode(c, eligible) ?? normCode(c)));
  for (const course of candidates) {
    const code = normCode(course.courseCode);
    if (!allowed.has(code) || excluded.has(code)) throw new Error(`Unsafe solver candidate: ${code} is not eligible.`);
  }
}
