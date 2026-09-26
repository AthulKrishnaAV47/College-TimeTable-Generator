"use client";

import { useMemo, useState } from "react";
import type {
  Course,
  CoursePreferences,
  ScheduleConstraints,
} from "@/lib/types";
import {
  buildPlacements,
  cellsAllowed,
  realCells,
  placementSignature,
} from "@/lib/solver";
import ConstraintsCard from "@/components/ConstraintsCard";
import { Badge, Btn, Card, SectionTitle } from "@/components/ui";

/**
 * Step 4 (§3.4): per-course section-mode confirmation. The parser's heuristic
 * (≤2 sections sharing the same faculty → mandatory combo) is pre-selected,
 * but every toggle stays overridable — the student knows their registration
 * system. A soft faculty preference feeds solution ranking, and hard
 * no-class day/time rules (constraints) filter what the solver may pick.
 */

interface Props {
  enrolledCourses: Course[];
  coursePrefs: Record<string, CoursePreferences>;
  constraints: ScheduleConstraints;
  onChangePrefs: (code: string, prefs: CoursePreferences) => void;
  onChangeConstraints: (c: ScheduleConstraints) => void;
  onSolve: () => void;
  onBack: () => void;
}

function fmtCells(
  cells: { day: string; startTime: string; endTime: string }[],
): string {
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
  constraints,
  onChangePrefs,
  onChangeConstraints,
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
        const unlocked = buildPlacements(c, {
          ...prefs,
          lockedPlacementId: null,
        });
        const allowedCount = placements.filter((p) =>
          cellsAllowed(p.busy, constraints),
        ).length;
        const faculty = [...new Set(c.sections.flatMap((s) => s.faculty))];
        return {
          course: c,
          prefs,
          placements,
          unlocked,
          allowedCount,
          faculty,
        };
      }),
    [enrolledCourses, coursePrefs, constraints],
  );

  const fullyBlocked = perCourse.filter((x) => x.allowedCount === 0);
  const totalPlacements = perCourse.reduce(
    (s, x) => s * Math.max(1, x.allowedCount),
    1,
  );

  return (
    <div className="space-y-5">
      <ConstraintsCard
        constraints={constraints}
        onChange={onChangeConstraints}
      />

      {fullyBlocked.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ With the current no-class rules,{" "}
          {fullyBlocked.map((x) => x.course.courseCode).join(", ")}{" "}
          {fullyBlocked.length === 1 ? "has" : "have"} no sections left. Adjust
          a rule, section lock or subject selection before solving. A pinned
          course must be unpinned before removal.{" "}
        </div>
      )}
      <Card className="p-5">
        <SectionTitle hint="the heuristic suggestion is pre-selected — override anything you know is wrong">
          How do this term's sections work for each subject?
        </SectionTitle>
        <div className="space-y-4">
          {perCourse.map(
            ({
              course,
              prefs,
              placements,
              unlocked,
              allowedCount,
              faculty,
            }) => {
              const comboBroken =
                prefs.sectionMode === "mandatory-combo" &&
                placements.length === 0;
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
                      <span className="text-sm text-slate-600">
                        {course.courseName}
                      </span>
                      <Badge tone="slate">{course.credits} cr</Badge>
                    </div>
                    <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs font-medium">
                      <button
                        className={`px-3 py-1.5 ${
                          prefs.sectionMode === "alternative"
                            ? "bg-blue-600 text-slate-800"
                            : "bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                        disabled={!!prefs.lockedPlacementId}
                        onClick={() =>
                          onChangePrefs(course.courseCode, {
                            ...prefs,
                            sectionMode: "alternative",
                          })
                        }
                      >
                        Alternatives — pick 1
                      </button>
                      <button
                        className={`px-3 py-1.5 ${
                          prefs.sectionMode === "mandatory-combo"
                            ? "bg-purple-600 text-slate-800"
                            : "bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                        disabled={!!prefs.lockedPlacementId}
                        onClick={() =>
                          onChangePrefs(course.courseCode, {
                            ...prefs,
                            sectionMode: "mandatory-combo",
                          })
                        }
                      >
                        Required together — take all
                      </button>
                    </div>
                  </div>

                  <label className="mt-3 block text-sm font-medium">
                    Lock section for {course.courseCode}
                    <select
                      aria-label={`Lock section for ${course.courseCode}`}
                      className="mt-1 w-full rounded-lg border bg-white p-2 text-sm"
                      value={
                        prefs.lockedPlacementId && !placements.length
                          ? "__stale-lock__"
                          : (prefs.lockedPlacementId ?? "")
                      }
                      onChange={(e) => {
                        const selected = unlocked.find(
                          (p) => p.id === e.target.value,
                        );
                        onChangePrefs(course.courseCode, {
                          ...prefs,
                          lockedPlacementId: selected?.id ?? null,
                          lockedPlacementSignature: selected
                            ? placementSignature(selected)
                            : null,
                        });
                      }}
                    >
                      <option value="">No lock — solver can choose</option>
                      {prefs.lockedPlacementId && !placements.length && (
                        <option value="__stale-lock__" disabled>
                          Saved lock unavailable/changed:{" "}
                          {prefs.lockedPlacementId}
                        </option>
                      )}
                      {unlocked.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sections
                            .map(
                              (s) =>
                                `${s.slotCode} / ${s.batch} / ${s.faculty.join(", ") || "Faculty TBD"}`,
                            )
                            .join(" + ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  {prefs.lockedPlacementId && (
                    <p className="mt-1 text-xs text-indigo-800">
                      This course is now required. Its section lock is never
                      relaxed, even when no-class rules are relaxed. Unlock
                      before changing the section mode or removing the course.
                    </p>
                  )}
                  {prefs.lockedPlacementId && !placements.length && (
                    <p role="alert" className="mt-2 text-sm text-red-700">
                      Locked section is unavailable, changed, or invalid. Unlock
                      or explicitly choose a current section; the solver will
                      not substitute one.
                    </p>
                  )}
                  {course.sectionMode !== prefs.sectionMode && (
                    <p className="mt-2 text-[11px] text-amber-600">
                      Heuristic suggested “
                      {course.sectionMode === "alternative"
                        ? "alternatives"
                        : "mandatory combo"}
                      ” — you changed it, noted.
                    </p>
                  )}

                  <div className="mt-3 space-y-1.5">
                    {course.sections.map((s) => (
                      <div
                        key={s.slotCode}
                        className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600"
                      >
                        <span className="font-mono font-semibold text-slate-700">
                          {s.slotCode}
                        </span>
                        <span>{s.faculty.join(", ") || "faculty TBD"}</span>
                        <span className="text-slate-500">
                          {s.weeklyCells.length === 0
                            ? "no fixed time"
                            : fmtCells(s.weeklyCells)}
                        </span>
                        {s.selfPaced && <Badge tone="purple">self-paced</Badge>}
                        {!s.selfPaced &&
                          !cellsAllowed(realCells([s]), constraints) && (
                            <Badge tone="red">excluded by no-class rules</Badge>
                          )}
                        <span className="ml-auto text-slate-500">
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
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
                      >
                        <option value="">No preference</option>
                        {faculty.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="text-xs text-slate-500">
                      {prefs.sectionMode === "alternative"
                        ? `${allowedCount} candidate section${allowedCount === 1 ? "" : "s"}${
                            allowedCount !== placements.length
                              ? ` (${placements.length - allowedCount} excluded by rules)`
                              : ""
                          }`
                        : comboBroken
                          ? "combo impossible"
                          : `1 fixed package · ${realHours} contact hrs/wk`}
                    </span>
                    {comboBroken && (
                      <Badge tone="red">
                        ⚠ these sections overlap each other — take-all is
                        impossible, switch to alternatives or drop the course
                      </Badge>
                    )}
                  </div>
                </div>
              );
            },
          )}
        </div>
      </Card>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
        <Btn variant="secondary" onClick={onBack}>
          ← Back
        </Btn>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] text-slate-500 sm:inline">
            search space ≈ {totalPlacements.toLocaleString()} combinations
          </span>
          <Btn onClick={onSolve}>Find conflict-free timetables →</Btn>
        </div>
      </div>
    </div>
  );
}
