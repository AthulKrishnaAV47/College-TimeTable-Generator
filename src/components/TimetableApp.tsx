"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
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
import { assertEligiblePool, resolveCompleted } from "@/lib/courseCodes";
import { requiredCourseCodes } from "@/lib/requirements";
import { buildEligibility } from "@/lib/eligibility";
import { buildPlacements, solveWithFallback } from "@/lib/solver";
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
import { createWorkspaceStore, readLegacyWorkspace, clearLegacyWorkspace, newId, api, type SessionUser } from "@/lib/store";
import { downloadText } from "@/lib/download";
import SharedTerms from "@/components/SharedTerms";
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
  user: SessionUser;
  onLogout?: () => void;
}) {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [aliases, setAliases] = useState<{ alias: string; course_code: string }[]>([]);
  useEffect(() => { api<{ aliases: { alias: string; course_code: string }[] }>("/api/aliases").then(d => setAliases(d.aliases)).catch(() => {}); }, []);
  const [solverPool, setSolverPool] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<DraftSnapshot[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [syncStatus, setSyncStatus] = useState("Loading…");
  const [loadError, setLoadError] = useState("");
  const [retrySave, setRetrySave] = useState(0);
  const store = useRef<ReturnType<typeof createWorkspaceStore> | null>(null);
  if (!store.current) store.current = createWorkspaceStore(user.id);
  const saveVersion = useRef(0);
  useEffect(() => {
    let active = true;
    store.current!.load().then(data => {
      if (!active) return;
      setState(data.state); setDrafts(data.drafts); setHydrated(true); setSyncStatus("Saved to your account");
    }).catch(e => { if (active) setLoadError(e.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const version = ++saveVersion.current;
    setSyncStatus("Unsaved changes…");
    const timer = setTimeout(() => {
      setSyncStatus("Saving…");
      store.current!.save(state, drafts).then(() => {
        if (version === saveVersion.current) setSyncStatus("Saved to your account");
      }).catch(e => { if (version === saveVersion.current) setSyncStatus(`Not saved: ${e.message}`); });
    }, 600);
    return () => clearTimeout(timer);
  }, [state, drafts, hydrated, retrySave]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (syncStatus !== "Saved to your account") { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [syncStatus]);
  const updateDrafts = useCallback((next: DraftSnapshot[]) => setDrafts(next), []);

  const patch = useCallback(
    (p: Partial<AppState>) => setState((s) => ({ ...s, ...p })),
    []
  );

  /* -------------------------- derived data -------------------------- */
  const indexedCourses = useMemo(() => (state.slotSheet?.courses ?? []).map(c => ({ ...c,
    aliases: [...(c.aliases ?? []), ...aliases.filter(a => a.course_code === c.courseCode).map(a => a.alias)],
  })), [state.slotSheet, aliases]);
  const summary: EligibilitySummary | null = useMemo(() => {
    if (!state.slotSheet || !state.eligibility) return null;
    return buildEligibility(indexedCourses, state.eligibility.rows, state.profile);
  }, [state.slotSheet, state.eligibility, state.profile, indexedCourses]);

  const required = useMemo(() => requiredCourseCodes(state.pinnedCourseCodes, state.coursePrefs), [state.pinnedCourseCodes, state.coursePrefs]);
  const enrolledCourses: Course[] = useMemo(() => {
    if (!summary) return [];
    const all = [...summary.sbc, ...summary.fc];
    const chosen = state.mode === "auto" && state.autoChosen ? state.autoChosen : null;
    return all.filter(c => required.includes(c.courseCode) || (chosen ? chosen.includes(c.courseCode) : state.manualPicks[c.courseCode]));
  }, [summary, state.mode, state.autoChosen, state.manualPicks, required]);

  const enrolledCodes = useMemo(
    () => new Set(enrolledCourses.map((c) => c.courseCode)),
    [enrolledCourses, indexedCourses]
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
      if (enrolledCourses.length === 0 && required.length === 0) return;
      if (resolveCompleted(state.profile.completedCourseCodes, indexedCourses).unmatched.length) { patch({ step: 1 }); return; }
      assertEligiblePool(enrolledCourses, [...(summary?.sbc ?? []), ...(summary?.fc ?? [])], state.profile.completedCourseCodes);
      setSolverPool(enrolledCourses.map(c => c.courseCode));
      const prefs = prefsFor(enrolledCourses);
      const r = solveWithFallback(enrolledCourses, prefs, {
        pinnedCourseCodes: required,
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
    [enrolledCourses, prefsFor, state.rankBy, state.constraints, state.profile.completedCourseCodes, indexedCourses, summary, required, patch]
  );

  const handleAutoResult = useCallback(
    (_r: AutoSelectResult, chosenCodes: string[] | null) => {
      patch({
        autoChosen: chosenCodes,
        autoLog: _r.attempts,
        autoInitialCourseCodes: _r.attempts[0]?.selected ?? [],
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
      if (required.includes(code)) return;
      setState((s) => ({
        ...s,
        manualPicks: { ...s.manualPicks, [code]: !s.manualPicks[code] },
        autoChosen: s.mode === "auto" && s.autoChosen ? s.autoChosen.filter(c => c !== code) : null, solutions: null, failure: null, nearMiss: null, solveOutcome: null, autoLog: null,
      }));
    },
    [required]
  );

  const handleTogglePin = useCallback((code: string) => {
    setState(s => ({ ...s, pinnedCourseCodes: s.pinnedCourseCodes.includes(code) ? s.pinnedCourseCodes.filter(c => c !== code) : [...s.pinnedCourseCodes, code], autoLog: null, solutions: null, failure: null, nearMiss: null, solveOutcome: null }));
  }, []);

  const handleAutoSettings = useCallback(
    (s: AutoSettings) => patch({ autoSettings: s }),
    [patch]
  );

  const handleMode = useCallback((m: Mode) => patch({ mode: m, solutions: null, failure: null, nearMiss: null, solveOutcome: null }), [patch]);

  const handleProfile = useCallback(
    (p: StudentProfile) => {
      setSolverPool([]);
      setState((s) => ({ ...s, profile: p, autoChosen: null, autoLog: null, autoInitialCourseCodes: [], solutions: null, failure: null, nearMiss: null, solveOutcome: null, aiMessage: null }));
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
        aiMessage: null,
      }));
    },
    []
  );

  const handleReplaceCourse = useCallback(
    (removeCode: string, addCode: string, isFallback: boolean = false) => {
      setState((s) => {
        if (requiredCourseCodes(s.pinnedCourseCodes, s.coursePrefs).includes(removeCode)) throw new Error(`Cannot replace required course ${removeCode}. Unpin/unlock it explicitly first.`);
        const eligible = s.slotSheet && s.eligibility ? buildEligibility(indexedCourses, s.eligibility.rows, s.profile) : null;
        if (![...(eligible?.sbc ?? []), ...(eligible?.fc ?? [])].some(c => c.courseCode === addCode)) {
          throw new Error(`Replacement ${addCode} is not eligible.`);
        }
        const nextManualPicks = { ...s.manualPicks };
        delete nextManualPicks[removeCode];
        nextManualPicks[addCode] = true;

        let nextAutoChosen = s.autoChosen;
        if (nextAutoChosen) {
           nextAutoChosen = nextAutoChosen.filter(c => c !== removeCode);
           nextAutoChosen.push(addCode);
        }
        
        const addedCourse = s.slotSheet?.courses.find(c => c.courseCode === addCode);
        const removedCourse = enrolledCourses.find(c => c.courseCode === removeCode);
        
        const replacer = isFallback ? "The local fallback algorithm" : "The local planner";
        const aiMessage = `We couldn't generate a timetable with your original selections due to clashes. ${replacer} replaced [${removeCode}] ${removedCourse?.courseName || ''} with [${addCode}] ${addedCourse?.courseName || ''} as a suggestion. Regenerate the timetable to verify it is feasible.`;

        // Reconfirm sections before solving the suggested replacement.
        return {
           ...s,
           manualPicks: nextManualPicks,
           autoChosen: nextAutoChosen,
           solutions: null,
           failure: null,
           solveOutcome: null,
           nearMiss: null,
           step: 3,
           aiMessage
        };
      });
    },
    [enrolledCourses, indexedCourses]
  );

  const saveDraft = useCallback(
    (solution: ScheduleSolution, label: string) => {
      const names = new Map(enrolledCourses.map((c) => [c.courseCode, c]));
      const prefs = prefsFor(enrolledCourses);
      const draft: DraftSnapshot = {
        id: newId(),
        termDatasetId: state.termDatasetId ?? null,
        label: label.slice(0, 160),
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
    [drafts, enrolledCourses, prefsFor, state.profile, state.termDatasetId, updateDrafts]
  );

  const restoreDraft = useCallback(
    (d: DraftSnapshot) => {
      const picks: Record<string, boolean> = {};
      const prefs: Record<string, CoursePreferences> = {};
      for (const c of d.courseChoices) {
        picks[c.courseCode] = true;
        prefs[c.courseCode] = state.coursePrefs[c.courseCode]?.lockedPlacementId ? state.coursePrefs[c.courseCode] : { sectionMode: c.sectionMode, preferredFaculty: null };
      }
      patch({
        solutions: null, failure: null, nearMiss: null, solveOutcome: null, autoChosen: null, autoInitialCourseCodes: [],
        profile: { ...state.profile, termLabel: d.profile.termLabel },
        mode: "manual",
        manualPicks: picks,
        coursePrefs: { ...state.coursePrefs, ...prefs },
        step: state.slotSheet && state.eligibility ? 2 : 0,
      });
    },
    [patch, state.coursePrefs, state.slotSheet, state.eligibility, state.profile]
  );

  const step = state.step;
  const canGo = (i: number) => {
    if (i === 0 || i === 5) return true;
    if (!state.slotSheet || !state.eligibility || !summary) return false;
    if (i === 1) return true;
    if (resolveCompleted(state.profile.completedCourseCodes, indexedCourses).unmatched.length) return false;
    if (i === 2) return true;
    if (i === 3) return enrolledCodes.size > 0;
    if (i === 4) return enrolledCodes.size > 0;
    return true;
  };

  if (loadError) return <main className="p-10"><p role="alert">Could not load your account: {loadError}</p><button onClick={() => location.reload()}>Retry</button><button onClick={onLogout}>Sign out</button></main>;
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
      <section className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 text-sm">
        <strong>Beta</strong><span role="status">{syncStatus}</span>
        {syncStatus.startsWith("Not saved") && <button className="underline" onClick={() => setRetrySave(v => v + 1)}>Retry save</button>}
        <button className="underline" onClick={() => downloadText(JSON.stringify({ state, drafts }, null, 2), "my-timetable-data.json", "application/json")}>Export my data</button>
        <button className="underline" onClick={async () => {
          if (!window.confirm("Import old browser data into THIS account? Only proceed if this is your own data. This replaces your current workspace and drafts.")) return;
          try { const legacy = readLegacyWorkspace(); await store.current!.save(legacy.state, legacy.drafts); setState(legacy.state); setDrafts(legacy.drafts); clearLegacyWorkspace(); }
          catch (e) { setSyncStatus(`Not saved: ${e instanceof Error ? e.message : "Import failed"}`); }
        }}>Import legacy browser data</button>
        <button className="underline" onClick={async () => {
          if (!window.confirm("Request deletion of your account and private data within 30 days?")) return;
          try { const result = await api<{ message: string }>("/api/auth/delete", { method: "POST", body: "{}" }); window.alert(result.message); }
          catch (e) { window.alert(e instanceof Error ? e.message : "Request failed"); }
        }}>Request account deletion</button>
        {user.admin && <a href="/admin" className="underline">Moderator console</a>}
        <a href="/privacy" className="underline">Privacy</a>
      </section>
      {!user.verified && <p className="mb-4 rounded-xl bg-amber-50 p-4">Verify your email before submitting shared datasets. <button className="underline" onClick={async () => { try { const result = await api<{ message: string }>("/api/auth/resend", { method: "POST", body: "{}" }); alert(result.message); } catch (e) { alert(e instanceof Error ? e.message : "Unable to send email"); } }}>Resend verification</button></p>}
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
                onClick={() => { if (syncStatus === "Saved to your account" || window.confirm("There are unsaved changes. Sign out anyway?")) onLogout?.(); }}
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
              Term Timetable Generator · Beta
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

      <details className="mb-4 rounded-xl border bg-white p-4 text-xs">
        <summary className="cursor-pointer font-semibold">Show diagnostics</summary>
        <pre className="mt-2 overflow-auto">{JSON.stringify({
          completed: resolveCompleted(state.profile.completedCourseCodes, indexedCourses),
          eligible: [...(summary?.sbc ?? []), ...(summary?.fc ?? [])].map(c => c.courseCode),
          pinned: state.pinnedCourseCodes, requiredIncludingLocks: required, sectionLocks: Object.fromEntries(Object.entries(state.coursePrefs).filter(([, p]) => p.lockedPlacementId)),
          solverPool, autoAttempts: state.autoLog,
        }, null, 2)}</pre>
      </details>
      {/* Steps */}
      <div className="rounded-3xl bg-white/60 p-6 shadow-xl shadow-slate-200/50 ring-1 ring-slate-900/5 backdrop-blur-xl sm:p-8">
        {step === 0 && <SharedTerms slotSheet={state.slotSheet} eligibility={state.eligibility} termLabel={state.profile.termLabel} datasetId={state.termDatasetId} onSelect={d => {
          setSolverPool([]);
          patch({ slotSheet: d.slot_sheet, eligibility: d.eligibility, termDatasetId: d.id, datasetSource: { label: d.term_label, updatedAt: d.updated_at ?? null, loadedAt: new Date().toISOString() }, profile: { ...state.profile, termLabel: d.term_label }, manualPicks: {}, autoChosen: null, autoLog: null, autoInitialCourseCodes: [], solutions: null, failure: null, nearMiss: null, solveOutcome: null });
        }} />}
        {step === 0 && (
          <DataStep
            slotSheet={state.slotSheet}
            eligibility={state.eligibility}
            onSlotSheet={(p: ParsedSlotSheet) =>
              patch({ datasetSource: null, autoInitialCourseCodes: [], termDatasetId: null, slotSheet: p, autoChosen: null, autoLog: null, manualPicks: {}, solutions: null, failure: null, solveOutcome: null, nearMiss: null })
            }
            onEligibility={(p: ParsedEligibility) =>
              patch({ datasetSource: null, autoInitialCourseCodes: [], termDatasetId: null, eligibility: p, autoChosen: null, autoLog: null, manualPicks: {}, solutions: null, failure: null, solveOutcome: null, nearMiss: null })
            }
            onNext={() => patch({ step: 1 })}
          />
        )}

        {step === 1 && state.slotSheet && (
          <ProfileStep
            profile={state.profile}
            courses={indexedCourses}
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
            onTogglePin={handleTogglePin}
            onUnlock={code => handleChangePrefs(code, { ...state.coursePrefs[code], lockedPlacementId: null, lockedPlacementSignature: null })}
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
            readinessInput={{ eligible: [...(summary?.sbc ?? []), ...(summary?.fc ?? [])], targets: state.autoSettings, pinnedCourseCodes: state.pinnedCourseCodes, prefs: state.coursePrefs, constraints: state.constraints, initialAutoCodes: state.mode === "auto" ? state.autoInitialCourseCodes : [], datasetSource: state.datasetSource }}
            protectedCodes={required}
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
            allCourses={[...(summary?.sbc ?? []), ...(summary?.fc ?? [])]}
            onReplaceCourse={handleReplaceCourse}
            aiMessage={state.aiMessage}
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
          constraints. Your profile and drafts are private and saved to your account.
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
