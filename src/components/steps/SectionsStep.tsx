"use client";

import { useMemo } from "react";
import type { Course, CoursePreferences } from "@/lib/types";
import { buildPlacements } from "@/lib/solver";
import { Badge, Btn, Card, SectionTitle } from "@/components/ui";

/**
 * Step 4 (§3.4): per-course section-mode confirmation. The parser's heuristic
 * (≤2 sections sharing the same faculty → mandatory combo) is pre-selected,
 * but every toggle stays overridable — the student knows their registration
 * system. A soft faculty preference feeds solution ranking.
 */

interface Props {
  enrolledCourses: Course[];
  coursePrefs: Record<string, CoursePreferences>;
  onChangePrefs: (code: string, prefs: CoursePreferences) => void;
  onSolve: () => void;
  onBack: () => void;
}

function fmtCells(cells: { day: string; startTime: string; endTime: string }[]): string {
  const byDay = new Map<string, string[]>();
  for (const c of cells) {
    if (!byDay.has(c.day)) byDay.set(c.day, []);
    byDay.get(c.day)!.push(`${c.startTime}–${c.endTime}`);
  }
  return [...byDay.entries()]
    .map(([d, ts]) => `${d.slice(0, 3)} ${ts.join(", ")}`)
    .join(" · ");
}

export default function SectionsStep({
  enrolledCourses,
  coursePrefs,
  onChangePrefs,
  onSolve,
  onBack,
}: Props) {
  const perCourse = useMemo(
    () =>
      enrolledCourses.map((c) => {
        const prefs = coursePrefs[c.courseCode] ?? {
          sectionMode: c.sectionMode,
          preferredFaculty: null,
        };
        const placements = buildPlacements(c, prefs);
        const faculty = [
          ...new Set(c.sections.flatMap((s) => s.faculty)),
        ];
        return { course: c, prefs, placements, faculty };
      }),
    [enrolledCourses, coursePrefs]
  );

  const totalPlacements = perCourse.reduce((s, x) => s * Math.max(1, x.placements.length), 1);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <SectionTitle hint="the heuristic suggestion is pre-selected — override anything you know is wrong">
          How do this term's sections work for each subject?
        </SectionTitle>
        <div className="space-y-4">
          {perCourse.map(({ course, prefs, placements, faculty }) => {
            const comboBroken =
              prefs.sectionMode === "mandatory-combo" && placements.length === 0;
            const realHours = placements[0]?.busy.length ?? 0;
            return (
              <div
                key={course.courseCode}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-bold text-slate-800">
                      {course.courseCode}
                    </span>
                    <span className="text-sm text-slate-600">{course.courseName}</span>
                    <Badge tone="slate">{course.credits} cr</Badge>
                  </div>
                  <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs font-medium">
                    <button
                      className={`px-3 py-1.5 ${
                        prefs.sectionMode === "alternative"
                          ? "bg-blue-600 text-white"
                          : "bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                      onClick={() =>
                        onChangePrefs(course.courseCode, { ...prefs, sectionMode: "alternative" })
                      }
                    >
                      Alternatives — pick 1
                    </button>
                    <button
                      className={`px-3 py-1.5 ${
                        prefs.sectionMode === "mandatory-combo"
                          ? "bg-purple-600 text-white"
                          : "bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                      onClick={() =>
                        onChangePrefs(course.courseCode, { ...prefs, sectionMode: "mandatory-combo" })
                      }
                    >
                      Required together — take all
                    </button>
                  </div>
                </div>

                {course.sectionMode !== prefs.sectionMode && (
                  <p className="mt-2 text-[11px] text-amber-600">
                    Heuristic suggested “{course.sectionMode === "alternative" ? "alternatives" : "mandatory combo"}
                    ” — you changed it, noted.
                  </p>
                )}

                <div className="mt-3 space-y-1.5">
                  {course.sections.map((s) => (
                    <div
                      key={s.slotCode}
                      className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600"
                    >
                      <span className="font-mono font-semibold text-slate-700">{s.slotCode}</span>
                      <span>{s.faculty.join(", ") || "faculty TBD"}</span>
                      <span className="text-slate-400">
                        {s.weeklyCells.length === 0
                          ? "no fixed time"
                          : fmtCells(s.weeklyCells)}
                      </span>
                      {s.selfPaced && <Badge tone="purple">self-paced</Badge>}
                      <span className="ml-auto text-slate-400">
                        {s.startDate} → {s.endDate}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    Prefer faculty
                    <select
                      value={prefs.preferredFaculty ?? ""}
                      onChange={(e) =>
                        onChangePrefs(course.courseCode, {
                          ...prefs,
                          preferredFaculty: e.target.value || null,
                        })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">No preference</option>
                      {faculty.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="text-xs text-slate-400">
                    {prefs.sectionMode === "alternative"
                      ? `${placements.length} candidate section${placements.length === 1 ? "" : "s"}`
                      : comboBroken
                        ? "combo impossible"
                        : `1 fixed package · ${realHours} contact hrs/wk`}
                  </span>
                  {comboBroken && (
                    <Badge tone="red">
                      ⚠ these sections overlap each other — take-all is impossible, switch to
                      alternatives or drop the course
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
        <Btn variant="secondary" onClick={onBack}>
          ← Back
        </Btn>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] text-slate-400 sm:inline">
            search space ≈ {totalPlacements.toLocaleString()} combinations
          </span>
          <Btn onClick={onSolve}>Find conflict-free timetables →</Btn>
        </div>
      </div>
    </div>
  );
}
