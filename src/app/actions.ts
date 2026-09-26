// Local deterministic suggestions; no unauthenticated server action or AI data transfer.

import { normCode } from "@/lib/courseCodes";
import { Course, NearMissSchedule } from "@/lib/types";

function findFallbackAlternative(
  enrolledCourses: Course[],
  availableCourses: Course[],
  nearMiss: NearMissSchedule,
  protectedCodes: string[] = []
) {
  const enrolledIds = enrolledCourses.map((c) => c.courseCode);
  const available = availableCourses.filter((c) => !enrolledIds.includes(c.courseCode));

  // Determine the course that causes the most clashes
  const clashCounts: Record<string, number> = {};
  for (const clash of nearMiss.clashes) {
    clashCounts[clash.courseA] = (clashCounts[clash.courseA] || 0) + 1;
    clashCounts[clash.courseB] = (clashCounts[clash.courseB] || 0) + 1;
  }

  let worstCourse = "";
  let maxClashes = -1;
  for (const [course, count] of Object.entries(clashCounts)) {
    if (protectedCodes.some(code => normCode(code) === normCode(course))) continue;
    if (count > maxClashes) {
      maxClashes = count;
      worstCourse = course;
    }
  }

  if (!worstCourse) return { removeCourse: "", addCourse: "" };

  const worstCourseObj = enrolledCourses.find((c) => c.courseCode === worstCourse);
  if (!worstCourseObj) return { removeCourse: "", addCourse: "" };

  // Find a similar course (same credits, ideally same department or similar name)
  let bestAlternative = "";
  let bestScore = -1;

  for (const alt of available) {
    let score = 0;
    if (alt.credits === worstCourseObj.credits) score += 10;
    
    // Check if they share words in the title
    const words1 = worstCourseObj.courseName.toLowerCase().split(/\s+/);
    const words2 = alt.courseName.toLowerCase().split(/\s+/);
    const sharedWords = words1.filter(w => words2.includes(w) && w.length > 3);
    score += sharedWords.length * 5;

    if (score > bestScore) {
      bestScore = score;
      bestAlternative = alt.courseCode;
    }
  }

  return {
    removeCourse: worstCourse,
    addCourse: bestAlternative || "",
  };
}

export async function findAlternativeCourseAction(
  enrolledCourses: Course[],
  availableCourses: Course[],
  nearMiss: NearMissSchedule,
  protectedCodes: string[] = []
) {
  const result = findFallbackAlternative(enrolledCourses, availableCourses, nearMiss, protectedCodes);
  if (result.addCourse && !availableCourses.some(c => c.courseCode === result.addCourse)) {
    return { success: false, result: { removeCourse: "", addCourse: "" }, fallback: true, error: "No eligible replacement." };
  }
  if (!result.addCourse) return { success: false, result, fallback: true, error: "No eligible replacement without dropping a pinned or locked course. Adjust the locks or subject selection explicitly." };
  return { success: true, result, fallback: true, error: undefined };
}
