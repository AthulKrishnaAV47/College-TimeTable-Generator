"use server";

import { Course, NearMissSchedule } from "@/lib/types";

function findFallbackAlternative(
  enrolledCourses: Course[],
  availableCourses: Course[],
  nearMiss: NearMissSchedule
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
  nearMiss: NearMissSchedule
) {
  try {
    const enrolledIds = enrolledCourses.map((c) => c.courseCode);
    const available = availableCourses
      .filter((c) => !enrolledIds.includes(c.courseCode))
      .map((c) => ({
        code: c.courseCode,
        name: c.courseName,
        credits: c.credits,
        type: (c as any).type,
      }));

    const conflicts = nearMiss.clashes.map(
      (c) => `${c.courseA} clashes with ${c.courseB} at ${c.windows.join(", ")}`
    );

    const prompt = `
I have a college timetable generator. The student selected these courses: ${enrolledIds.join(", ")}.
However, a conflict-free timetable cannot be generated.
Here are the closest clashes found:
${conflicts.join("\n")}

The goal is to replace ONE of the blocking courses with another course from the available list that is similar (e.g. similar name, same credits, same type) so the student can still have a valid timetable.

Available courses (not enrolled yet):
${JSON.stringify(available, null, 2)}

Please return a JSON object with two fields:
1. "removeCourse": the course code of the enrolled course to drop.
2. "addCourse": the course code of the available course to add.
If no good replacement is found, return empty strings for both. Return ONLY valid JSON, no markdown formatting.
`;

    const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing Grok API key");
    }

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${apiKey}\`,
      },
      body: JSON.stringify({
        model: "grok-beta",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that analyzes college course conflicts and suggests alternative courses in JSON format.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error(\`Grok API error: \${response.statusText}\`);
    }

    const data = await response.json();
    const text = data.choices[0].message.content;

    const result = JSON.parse(text);
    return { success: true, result, fallback: false };
  } catch (error: any) {
    console.error("AI Error, using fallback:", error);
    // Fallback to local search
    const fallbackResult = findFallbackAlternative(enrolledCourses, availableCourses, nearMiss);
    return { success: true, result: fallbackResult, fallback: true };
  }
}
