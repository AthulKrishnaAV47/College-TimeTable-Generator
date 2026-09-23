"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Course,
  CoursePreferences,
  DraftSnapshot,
  EligibilitySummary,
  RankPreference,
  ScheduleSolution,
  StudentProfile,
} from "@/lib/types";
import { buildEligibility } from "@/lib/eligibility";
import { solve, autoSelectCourses } from "@/lib/solver";
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
import { loadDrafts, loadSession, newId, saveDrafts, saveSession } from "@/lib/store";
import DataStep from "@/components/steps/DataStep";
import ProfileStep from "@/components/steps/ProfileStep";
import SubjectsStep from "@/components/steps/SubjectsStep";
import SectionsStep from "@/components/steps/SectionsStep";
import ScheduleStep from "@/components/steps/ScheduleStep";
import DraftsStep from "@/components/steps/DraftsStep";

export default function TimetableApp() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [drafts, setDrafts] = useState<DraftSnapshot[]>([]);
  const [hydrated, setHydrated] = useState(false);

  /* -------------------------- persistence -------------------------- */
  useEffect(() => {
    const session = loadSession<AppState>();
    if (session) {
      setState({ ...DEFAULT_STATE, ...session });
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
      const r = solve(enrolledCourses, prefsFor(enrolledCourses), {
        rankBy: rankBy ?? state.rankBy,
        maxSolutions: 50,
      });
      if (r.ok) {
        patch({
          solutions: r.solutions,
          truncatedSearch: r.truncated,
          solutionIdx: 0,
          failure: null,
          step: 4,
        });
      } else {
        patch({ solutions: null, truncatedSearch: false, failure: r, step: 4 });
      }
    },
    [enrolledCourses, prefsFor, state.rankBy, patch]
  );

  const handleAutoResult = useCallback(
    (_r: AutoSelectResult, chosenCodes: string[] | null) => {
      patch({ autoChosen: chosenCodes, solutions: null, failure: null });
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
      <main className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-slate-400">
        Loading your session…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <header className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Term Timetable Generator
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Turn a MyCamu term slot sheet into a valid, conflict-free weekly timetable: 100% of
              weekly contact hours for every enrolled section, zero day+time collisions.
            </p>
          </div>
          <button
            className="text-xs text-slate-400 underline hover:text-slate-600"
            onClick={() => {
              if (window.confirm("Reset the current session (drafts are kept)?")) {
                setState({ ...DEFAULT_STATE });
              }
            }}
          >
            Reset session
          </button>
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
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
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
          onSlotSheet={(p: ParsedSlotSheet) => patch({ slotSheet: p, solutions: null, failure: null })}
          onEligibility={(p: ParsedEligibility) => patch({ eligibility: p, solutions: null, failure: null })}
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
          onChangePrefs={handleChangePrefs}
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
          onSaveDraft={saveDraft}
          onBack={() => patch({ step: 3 })}
          onReenroll={() => patch({ step: 2 })}
        />
      )}

      {step === 5 && (
        <DraftsStep drafts={drafts} onUpdate={updateDrafts} onRestore={restoreDraft} />
      )}

      <footer className="mt-10 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-400">
        Eligibility = (courses offered this term, File A) ∩ (SBC/FC + year rows, File B) − completed
        courses. Conflict checks run at 1-hour granularity across every enrolled section; 1-minute
        administrative placeholders are treated as self-paced and never block a schedule. Session
        data and drafts live only in your browser’s localStorage.
      </footer>
    </main>
  );
}
