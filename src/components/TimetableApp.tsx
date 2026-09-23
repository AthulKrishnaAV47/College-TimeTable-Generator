"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Course,
  CoursePreferences,
  DraftSnapshot,
  EligibilitySummary,
  NearMissSchedule,
  Placement,
  RankPreference,
  ScheduleConstraints,
  ScheduleSolution,
  StudentProfile,
} from "@/lib/types";
import { buildEligibility } from "@/lib/eligibility";
import { buildPlacements, solveWithFallback, autoSelectCourses } from "@/lib/solver";
import type { AutoSelectResult } from "@/lib/solver";
import {
  DEFAULT_STATE,
  STEPS,
  type AppState,
  type AutoSettings,
  type Mode,
  type ParsedEligibility,
  type ParsedSlotSheet,
} from "@/lib/appState";
import {
  loadDrafts,
  loadSession,
  newId,
  saveDrafts,
  saveSession,
  type SessionUser,
} from "@/lib/store";
import DataStep from "@/components/steps/DataStep";
import ProfileStep from "@/components/steps/ProfileStep";
import SubjectsStep from "@/components/steps/SubjectsStep";
import SectionsStep from "@/components/steps/SectionsStep";
import ScheduleStep from "@/components/steps/ScheduleStep";
import DraftsStep from "@/components/steps/DraftsStep";

export default function TimetableApp({
  user,
  onLogout,
}: {
  user?: SessionUser | null;
  onLogout?: () => void;
} = {}) {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [drafts, setDrafts] = useState<DraftSnapshot[]>([]);
  const [hydrated, setHydrated] = useState(false);

  /* -------------------------- persistence -------------------------- */
  useEffect(() => {
    const session = loadSession<AppState>();
    if (session) {
      setState({
        ...DEFAULT_STATE,
        ...session,
        // older sessions predate the constraints field
        constraints: {
          excludedDays: session.constraints?.excludedDays ?? [],
          excludedRanges: session.constraints?.excludedRanges ?? [],
        },
      });
    }
    setDrafts(loadDrafts());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveSession(state);
  }, [state, hydrated]);

  const updateDrafts = useCallback((next: DraftSnapshot[]) => {
    setDrafts(next);
    saveDrafts(next);
  }, []);

  const patch = useCallback(
    (p: Partial<AppState>) => setState((s) => ({ ...s, ...p })),
    []
  );

  /* -------------------------- derived data -------------------------- */
  const summary: EligibilitySummary | null = useMemo(() => {
    if (!state.slotSheet || !state.eligibility) return null;
    return buildEligibility(state.slotSheet.courses, state.eligibility.rows, state.profile);
  }, [state.slotSheet, state.eligibility, state.profile]);

  const enrolledCourses: Course[] = useMemo(() => {
    if (!summary) return [];
    const all = [...summary.sbc, ...summary.fc];
    const chosen = state.mode === "auto" && state.autoChosen ? state.autoChosen : null;
    if (chosen) {
      return chosen
        .map((code) => all.find((c) => c.courseCode === code))
        .filter((c) => c !== undefined) as Course[];
    }
    return all.filter((c) => state.manualPicks[c.courseCode]);
  }, [summary, state.mode, state.autoChosen, state.manualPicks]);

  const enrolledCodes = useMemo(
    () => new Set(enrolledCourses.map((c) => c.courseCode)),
    [enrolledCourses]
  );

  const prefsFor = useCallback(
    (courses: Course[]): Record<string, CoursePreferences> => {
      const out: Record<string, CoursePreferences> = {};
      for (const c of courses) {
        out[c.courseCode] = state.coursePrefs[c.courseCode] ?? {
          sectionMode: c.sectionMode,
          preferredFaculty: null,
        };
      }
      return out;
    },
    [state.coursePrefs]
  );

  /* -------------------------- solving -------------------------- */
  const runSolve = useCallback(
    (rankBy?: RankPreference) => {
      if (enrolledCourses.length === 0) return;
      const prefs = prefsFor(enrolledCourses);
      const r = solveWithFallback(enrolledCourses, prefs, {
        rankBy: rankBy ?? state.rankBy,
        maxSolutions: 50,
        constraints: state.constraints,
      });
      if (r.outcome === "impossible") {
        // Make the best near-miss schedule renderable: resolve its
        // placement ids back to full placements for the grid.
        let nearMiss: NearMissSchedule | null = null;
        if (r.bestNearMiss) {
          const byId = new Map<string, Placement>();
          for (const c of enrolledCourses) {
            for (const pl of buildPlacements(c, prefs[c.courseCode])) byId.set(pl.id, pl);
          }
          const placements: Record<string, Placement> = {};
          for (const [code, id] of Object.entries(r.bestNearMiss.assignment)) {
            const pl = byId.get(id);
            if (pl) placements[code] = pl;
          }
          nearMiss = {
            placements,
            clashes: r.bestNearMiss.clashes,
            conflictHours: r.bestNearMiss.conflictHours,
          };
        }
        patch({
          solutions: null,
          truncatedSearch: false,
          solutionIdx: 0,
          failure: r.failure,
          solveOutcome: "impossible",
          nearMiss,
          step: 4,
        });
      } else {
        patch({
          solutions: r.solutions,
          truncatedSearch: r.truncated,
          solutionIdx: 0,
          failure: null,
          solveOutcome: r.outcome,
          nearMiss: null,
          step: 4,
        });
      }
    },
    [enrolledCourses, prefsFor, state.rankBy, state.constraints, patch]
  );

  const handleAutoResult = useCallback(
    (_r: AutoSelectResult, chosenCodes: string[] | null) => {
      patch({
        autoChosen: chosenCodes,
        solutions: null,
        failure: null,
        solveOutcome: null,
        nearMiss: null,
      });
    },
    [patch]
  );

  /* When the rank preference changes on the schedule step, re-rank by re-solving. */
  const handleRankBy = useCallback(
    (r: RankPreference) => {
      patch({ rankBy: r });
      runSolve(r);
    },
    [patch, runSolve]
  );

  const handleTogglePick = useCallback(
    (code: string) => {
      setState((s) => ({
        ...s,
        manualPicks: { ...s.manualPicks, [code]: !s.manualPicks[code] },
        autoChosen: null,
      }));
    },
    []
  );

  const handleAutoSettings = useCallback(
    (s: AutoSettings) => patch({ autoSettings: s }),
    [patch]
  );

  const handleMode = useCallback((m: Mode) => patch({ mode: m }), [patch]);

  const handleProfile = useCallback(
    (p: StudentProfile) => {
      setState((s) => ({ ...s, profile: p }));
    },
    []
  );

  const handleChangePrefs = useCallback(
    (code: string, prefs: CoursePreferences) => {
      setState((s) => ({
        ...s,
        coursePrefs: { ...s.coursePrefs, [code]: prefs },
        solutions: null,
        failure: null,
        solveOutcome: null,
        nearMiss: null,
      }));
    },
    []
  );

  const handleChangeConstraints = useCallback(
    (constraints: ScheduleConstraints) => {
      setState((s) => ({
        ...s,
        constraints,
        solutions: null,
        failure: null,
        solveOutcome: null,
        nearMiss: null,
      }));
    },
    []
  );

  const saveDraft = useCallback(
    (solution: ScheduleSolution, label: string) => {
      const names = new Map(enrolledCourses.map((c) => [c.courseCode, c]));
      const prefs = prefsFor(enrolledCourses);
      const draft: DraftSnapshot = {
        id: newId(),
        label,
        createdAt: new Date().toISOString(),
        profile: state.profile,
        courseChoices: Object.entries(solution.placements).map(([code, p]) => ({
          courseCode: code,
          courseName: names.get(code)?.courseName ?? code,
          credits: names.get(code)?.credits ?? 0,
          type:
            (names.get(code) as { type?: "SBC" | "FC" } | undefined)?.type ?? "FC",
          placementId: p.id,
          sectionMode: prefs[code]?.sectionMode ?? "alternative",
        })),
        metrics: solution.metrics,
        placements: solution.placements,
      };
      updateDrafts([draft, ...drafts]);
    },
    [drafts, enrolledCourses, prefsFor, state.profile, updateDrafts]
  );

  const restoreDraft = useCallback(
    (d: DraftSnapshot) => {
      const picks: Record<string, boolean> = {};
      const prefs: Record<string, CoursePreferences> = {};
      for (const c of d.courseChoices) {
        picks[c.courseCode] = true;
        prefs[c.courseCode] = { sectionMode: c.sectionMode, preferredFaculty: null };
      }
      patch({
        profile: d.profile,
        mode: "manual",
        manualPicks: picks,
        coursePrefs: { ...state.coursePrefs, ...prefs },
        step: state.slotSheet && state.eligibility ? 2 : 0,
      });
    },
    [patch, state.coursePrefs, state.slotSheet, state.eligibility]
  );

  const step = state.step;
  const canGo = (i: number) => {
    if (i === 0) return true;
    if (!state.slotSheet || !state.eligibility || !summary) return false;
    if (i === 1) return true;
    if (i === 2) return true;
    if (i === 3) return enrolledCodes.size > 0;
    if (i === 4) return enrolledCodes.size > 0;
    return true;
  };

  if (!hydrated) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 text-center text-base text-slate-400">
        Loading your session…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <header className="mb-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-base font-bold text-white shadow-md">
              {(user?.name ?? "S").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight text-slate-800">
                {user ? user.name : "Student"}
              </p>
              <p className="text-xs leading-tight text-slate-400">{user?.email ?? "local session"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
              onClick={() => {
                if (window.confirm("Reset the current session (drafts are kept)?")) {
                  setState({ ...DEFAULT_STATE });
                }
              }}
            >
              Reset session
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="title-gradient text-3xl font-extrabold tracking-tight">
              Term Timetable Generator
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Turn a MyCamu term slot sheet into a valid, conflict-free weekly timetable: 100% of
              weekly contact hours for every enrolled section, zero day+time collisions.
            </p>
          </div>
        </div>
      </header>

      {/* Stepper */}
      <nav className="mb-6 flex flex-wrap gap-1.5">
        {STEPS.map((label, i) => {
          const activeStep = step === i;
          const reachable = canGo(i);
          return (
            <button
              key={label}
              disabled={!reachable}
              onClick={() => reachable && patch({ step: i })}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${
                activeStep
                  ? "bg-slate-900 text-white"
                  : reachable
                    ? "bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
                    : "bg-slate-100 text-slate-300 border border-slate-100 cursor-not-allowed"
              }`}
            >
              <span
                className={`flex h-4.5 w-4.5 items-center justify-center rounded-full text-[10px] ${
                  activeStep ? "bg-white/20" : "bg-slate-100"
                }`}
                style={{ height: 18, width: 18 }}
              >
                {i + 1}
              </span>
              {label}
            </button>
          );
        })}
      </nav>

      {/* Steps */}
      {step === 0 && (
        <DataStep
          slotSheet={state.slotSheet}
          eligibility={state.eligibility}
          onSlotSheet={(p: ParsedSlotSheet) =>
            patch({ slotSheet: p, solutions: null, failure: null, solveOutcome: null, nearMiss: null })
          }
          onEligibility={(p: ParsedEligibility) =>
            patch({ eligibility: p, solutions: null, failure: null, solveOutcome: null, nearMiss: null })
          }
          onNext={() => patch({ step: 1 })}
        />
      )}

      {step === 1 && state.slotSheet && (
        <ProfileStep
          profile={state.profile}
          courses={state.slotSheet.courses}
          onChange={handleProfile}
          onNext={() => patch({ step: 2 })}
          onBack={() => patch({ step: 0 })}
        />
      )}

      {step === 2 && summary && (
        <SubjectsStep
          state={state}
          summary={summary}
          enrolledCodes={enrolledCodes}
          onMode={handleMode}
          onTogglePick={handleTogglePick}
          onAutoSettings={handleAutoSettings}
          onAutoResult={handleAutoResult}
          onNext={() => patch({ step: 3 })}
          onBack={() => patch({ step: 1 })}
        />
      )}

      {step === 3 && (
        <SectionsStep
          enrolledCourses={enrolledCourses}
          coursePrefs={state.coursePrefs}
          constraints={state.constraints}
          onChangePrefs={handleChangePrefs}
          onChangeConstraints={handleChangeConstraints}
          onSolve={() => runSolve()}
          onBack={() => patch({ step: 2 })}
        />
      )}

      {step === 4 && (
        <ScheduleStep
          profile={state.profile}
          enrolledCourses={enrolledCourses}
          rankBy={state.rankBy}
          onRankBy={handleRankBy}
          solutions={state.solutions}
          truncated={state.truncatedSearch}
          solutionIdx={state.solutionIdx}
          onSolutionIdx={(i) => patch({ solutionIdx: i })}
          failure={state.failure}
          solveOutcome={state.solveOutcome}
          nearMiss={state.nearMiss}
          constraints={state.constraints}
          onSaveDraft={saveDraft}
          onBack={() => patch({ step: 3 })}
          onReenroll={() => patch({ step: 2 })}
        />
      )}

      {step === 5 && (
        <DraftsStep drafts={drafts} onUpdate={updateDrafts} onRestore={restoreDraft} />
      )}

      <footer className="mt-10 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-400">
        Eligibility = (courses offered this term, File A) ∩ (SBC/FC + year rows, File B — Year II
        &amp; III also includes Year I subjects) − completed courses. Conflict checks run at 1-hour
        granularity across every enrolled section; 1-minute administrative placeholders are treated
        as self-paced and never block a schedule, and your no-class day/time rules are hard solver
        constraints. Session data and drafts live only in your browser’s localStorage.
      </footer>
    </main>
  );
}
