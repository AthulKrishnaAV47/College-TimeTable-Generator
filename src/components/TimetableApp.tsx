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

import { CalendarDays, LogOut, RefreshCcw, CheckCircle2, ChevronRight } from "lucide-react";

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
      <main className="mx-auto flex max-w-5xl items-center justify-center px-4 py-32 text-center text-lg text-slate-500 animate-pulse font-medium">
        <RefreshCcw className="mr-3 h-6 w-6 animate-spin text-blue-500" />
        Loading your session...
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <header className="mb-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[2rem] border border-white/60 bg-white/70 px-6 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-500 text-xl font-bold text-slate-800 shadow-lg shadow-blue-500/25 ring-4 ring-white/50">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-bold tracking-tight text-slate-800">
                {user ? user.name : "Student"}
              </p>
              <p className="text-sm font-medium text-slate-500">{user?.email ?? "local session"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition-all hover:bg-red-50 hover:text-red-600"
              onClick={() => {
                if (window.confirm("Reset the current session (drafts are kept)?")) {
                  setState({ ...DEFAULT_STATE });
                }
              }}
            >
              <RefreshCcw className="h-4 w-4" />
              Reset session
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:scale-105 hover:border-indigo-200 hover:text-indigo-700 hover:shadow-md"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 px-2">
          <div>
            <h1 className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
              Term Timetable Generator
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-500">
              Turn your MyCamu term slot sheet into a perfect, conflict-free weekly timetable. Ensure 100% of your contact hours are met with zero day or time collisions.
            </p>
          </div>
        </div>
      </header>

      {/* Stepper */}
      <nav className="mb-10 flex flex-wrap justify-center gap-2 rounded-2xl bg-white/50 p-2.5 shadow-sm ring-1 ring-slate-900/5 backdrop-blur-xl sm:justify-start">
        {STEPS.map((label, i) => {
          const activeStep = step === i;
          const reachable = canGo(i);
          const completed = reachable && i < step;
          return (
            <button
              key={label}
              disabled={!reachable}
              onClick={() => reachable && patch({ step: i })}
              className={`group flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-bold transition-all duration-300 ${
                activeStep
                  ? "bg-gradient-to-r from-indigo-500 to-blue-600 text-slate-800 shadow-md shadow-blue-500/20 scale-[1.02]"
                  : reachable
                    ? "bg-transparent text-slate-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm"
                    : "bg-transparent text-slate-500 opacity-50 cursor-not-allowed"
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs transition-colors ${
                  activeStep
                    ? "bg-white/20 text-slate-800"
                    : completed
                      ? "bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200"
                      : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                }`}
              >
                {completed ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </span>
              {label}
              {i < STEPS.length - 1 && (
                <ChevronRight className={`ml-1 h-4 w-4 opacity-40 ${activeStep ? 'text-slate-800' : 'text-slate-500'}`} />
              )}
            </button>
          );
        })}
      </nav>

      {/* Steps */}
      <div className="rounded-3xl bg-white/60 p-6 shadow-xl shadow-slate-200/50 ring-1 ring-slate-900/5 backdrop-blur-xl sm:p-8">
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
      </div>

      <footer className="mt-16 flex flex-col items-center gap-4 text-center">
        <p className="max-w-3xl text-sm leading-relaxed text-slate-500">
          Eligibility = (courses offered this term, File A) ∩ (SBC/FC + year rows, File B — Year II
          &amp; III also includes Year I subjects) − completed courses. Conflict checks run at 1-hour
          granularity across every enrolled section; 1-minute administrative placeholders are treated
          as self-paced and never block a schedule, and your no-class day/time rules are hard solver
          constraints. Session data and drafts live only in your browser’s localStorage.
        </p>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-all hover:scale-105 hover:border-slate-300 hover:shadow">
          <span>Created by Athul Krishna A V</span>
          <a
            href="https://github.com/AthulKrishnaAV47"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700"
          >
            <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
            </svg>
            GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}
