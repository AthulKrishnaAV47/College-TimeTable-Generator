"use client";

import { useMemo, useState } from "react";
import type { Course, EligibilitySummary } from "@/lib/types";
import type { AppState, AutoSettings, Mode } from "@/lib/appState";
import { autoSelectCourses } from "@/lib/solver";
import type { AutoSelectResult } from "@/lib/solver";
import { Badge, Btn, Card, SectionTitle } from "@/components/ui";

/**
 * Step 3 (§3.2/§3.3): eligible subjects = File A (offered this term) ∩ File B
 * (SBC/FC + year) minus completed. Manual checklist or auto-selection with
 * SBC/FC targets; auto mode wraps the solver with a drop/swap retry budget.
 */

interface Props {
  state: AppState;
  summary: EligibilitySummary;
  enrolledCodes: Set<string>;
  onMode: (m: Mode) => void;
  onTogglePick: (code: string) => void;
  onAutoSettings: (s: AutoSettings) => void;
  onAutoResult: (r: AutoSelectResult, chosenCodes: string[] | null) => void;
  onNext: () => void;
  onBack: () => void;
}

function CourseRow({
  course,
  checked,
  onToggle,
  subtitle,
}: {
  course: Course;
  checked: boolean;
  onToggle: () => void;
  subtitle?: React.ReactNode;
}) {
  const sections = course.sections;
  const realHours = sections.reduce(
    (s, x) => s + (x.selfPaced ? 0 : x.weeklyCells.length),
    0
  );
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
        checked ? "border-blue-400 bg-blue-50/60" : "border-slate-200 bg-white hover:bg-slate-50"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-slate-800">{course.courseCode}</span>
          <span className="truncate text-sm text-slate-600">{course.courseName}</span>
        </div>
        {subtitle ?? (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            <span>{course.credits} credits</span>
            <span>· {sections.length} section{sections.length === 1 ? "" : "s"}</span>
            <span>· {realHours} contact hrs/wk</span>
            {sections.filter((x) => x.selfPaced).length > 0 && (
              <Badge tone="purple">
                self-paced ×{sections.filter((x) => x.selfPaced).length}
              </Badge>
            )}
          </div>
        )}
      </div>
    </label>
  );
}

export default function SubjectsStep({
  state,
  summary,
  enrolledCodes,
  onMode,
  onTogglePick,
  onAutoSettings,
  onAutoResult,
  onNext,
  onBack,
}: Props) {
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoResult, setAutoResult] = useState<AutoSelectResult | null>(null);

  const all = useMemo(() => [...summary.sbc, ...summary.fc], [summary]);

  const runAuto = () => {
    setAutoBusy(true);
    try {
      const prefs: Record<string, { sectionMode: "alternative" | "mandatory-combo"; preferredFaculty: string | null }> = {};
      for (const c of all) prefs[c.courseCode] = state.coursePrefs[c.courseCode] ?? { sectionMode: c.sectionMode, preferredFaculty: null };
      const s = state.autoSettings;
      const result = autoSelectCourses(all, prefs, {
        targetCount: s.useCredits ? null : s.targetCount,
        targetCredits: s.useCredits ? s.targetCredits : null,
        minSBC: s.minSBC,
        minFC: s.minFC,
        rankBy: state.rankBy,
        constraints: state.constraints,
      });
      setAutoResult(result);
      onAutoResult(result, result.ok ? result.chosen.map((c) => c.courseCode) : null);
    } finally {
      setAutoBusy(false);
    }
  };

  const sbcPicked = summary.sbc.filter((c) => enrolledCodes.has(c.courseCode)).length;
  const fcPicked = summary.fc.filter((c) => enrolledCodes.has(c.courseCode)).length;
  const creditsPicked = all
    .filter((c) => enrolledCodes.has(c.courseCode))
    .reduce((s, c) => s + c.credits, 0);

  const canProceed = enrolledCodes.size > 0;

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <Card className="p-5">
        <SectionTitle hint={`Year: ${state.profile.year} · ${state.profile.termLabel}`}>
          Eligible subjects for this term
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-blue-50 px-3 py-2">
            <div className="text-[11px] font-medium text-blue-500 uppercase">SBC eligible</div>
            <div className="text-lg font-semibold text-blue-800">{summary.sbc.length}</div>
          </div>
          <div className="rounded-xl bg-emerald-50 px-3 py-2">
            <div className="text-[11px] font-medium text-emerald-600 uppercase">FC eligible</div>
            <div className="text-lg font-semibold text-emerald-800">{summary.fc.length}</div>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-medium text-slate-500 uppercase">Picked</div>
            <div className="text-lg font-semibold text-slate-800">
              {enrolledCodes.size} <span className="text-sm text-slate-400">({creditsPicked} cr)</span>
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-medium text-slate-500 uppercase">SBC / FC picked</div>
            <div className="text-lg font-semibold text-slate-800">
              {sbcPicked} / {fcPicked}
            </div>
          </div>
        </div>
        {(summary.excludedByCompletion.length > 0 ||
          summary.excludedByYear.length > 0 ||
          summary.notInEligibilityTable.length > 0) && (
          <div className="mt-3 space-y-1 text-[11px] text-slate-500">
            {summary.excludedByCompletion.length > 0 && (
              <p>
                <Badge tone="slate">completed</Badge>{" "}
                {summary.excludedByCompletion.map((c) => c.courseCode).join(", ")}
              </p>
            )}
            {summary.excludedByYear.length > 0 && (
              <p>
                <Badge tone="slate">no matching year row in File B</Badge>{" "}
                {summary.excludedByYear.join(", ")}
              </p>
            )}
            {summary.notInEligibilityTable.length > 0 && (
              <p>
                <Badge tone="amber">not in eligibility table</Badge>{" "}
                {summary.notInEligibilityTable.join(", ")} — double-check File B if you need one of
                these.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Mode picker */}
      <div className="flex gap-2">
        {(
          [
            { id: "manual", label: "Manual — I'll tick my subjects" },
            { id: "auto", label: "Auto — pick a feasible subset for me" },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            onClick={() => onMode(m.id)}
            className={`flex-1 rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              state.mode === m.id
                ? "border-blue-600 bg-blue-50 text-blue-800"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {state.mode === "manual" ? (
        <Card className="p-5">
          <SectionTitle hint="tick what you're enrolling in this term">
            Subject checklist
          </SectionTitle>
          <div className="space-y-5">
            {(["SBC", "FC"] as const).map((group) => {
              const list = group === "SBC" ? summary.sbc : summary.fc;
              return (
                <div key={group}>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone={group === "SBC" ? "blue" : "green"}>{group}</Badge>
                    <span className="text-xs text-slate-400">
                      {list.length} available · {group === "SBC" ? sbcPicked : fcPicked} selected
                      (target ≥ {group === "SBC" ? state.autoSettings.minSBC : state.autoSettings.minFC})
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {list.map((c) => (
                      <CourseRow
                        key={c.courseCode}
                        course={c}
                        checked={!!state.manualPicks[c.courseCode]}
                        onToggle={() => onTogglePick(c.courseCode)}
                      />
                    ))}
                    {list.length === 0 && (
                      <p className="text-xs text-slate-400">No eligible {group} this term.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <SectionTitle hint="tries the highest-value subset first, then swaps the most constrained subject until the solver is satisfied">
            Auto-selection targets
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="w-40 text-sm text-slate-600">Target mode</label>
                <div className="flex overflow-hidden rounded-lg border border-slate-300">
                  <button
                    className={`px-3 py-1.5 text-xs font-medium ${!state.autoSettings.useCredits ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}
                    onClick={() => onAutoSettings({ ...state.autoSettings, useCredits: false })}
                  >
                    # of subjects
                  </button>
                  <button
                    className={`px-3 py-1.5 text-xs font-medium ${state.autoSettings.useCredits ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}
                    onClick={() => onAutoSettings({ ...state.autoSettings, useCredits: true })}
                  >
                    credit total
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="w-40 text-sm text-slate-600">
                  {state.autoSettings.useCredits ? "Target credits" : "Target subjects"}
                </label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={state.autoSettings.useCredits ? state.autoSettings.targetCredits : state.autoSettings.targetCount}
                  onChange={(e) =>
                    onAutoSettings(
                      state.autoSettings.useCredits
                        ? { ...state.autoSettings, targetCredits: Math.max(1, +e.target.value || 0) }
                        : { ...state.autoSettings, targetCount: Math.max(1, +e.target.value || 0) }
                    )
                  }
                  className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="w-40 text-sm text-slate-600">Minimum SBC</label>
                <input
                  type="number"
                  min={0}
                  max={8}
                  value={state.autoSettings.minSBC}
                  onChange={(e) => onAutoSettings({ ...state.autoSettings, minSBC: Math.max(0, +e.target.value || 0) })}
                  className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="w-40 text-sm text-slate-600">Minimum FC</label>
                <input
                  type="number"
                  min={0}
                  max={8}
                  value={state.autoSettings.minFC}
                  onChange={(e) => onAutoSettings({ ...state.autoSettings, minFC: Math.max(0, +e.target.value || 0) })}
                  className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Btn onClick={runAuto} disabled={autoBusy || all.length === 0}>
              {autoBusy ? "Solving…" : "Auto-pick feasible subset"}
            </Btn>
            {autoResult?.ok && (
              <span className="text-xs text-emerald-700">
                ✓ found a schedulable subset in {autoResult.attempts.length} solver attempt
                {autoResult.attempts.length === 1 ? "" : "s"}
              </span>
            )}
            {autoResult && !autoResult.ok && (
              <span className="text-xs text-red-600">
                Could not satisfy the targets — {autoResult.failure?.message ?? "no feasible subset"}
              </span>
            )}
          </div>

          {autoResult?.ok && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium text-slate-500 uppercase">
                Auto-picked subset
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {autoResult.chosen.map((c) => (
                  <CourseRow
                    key={c.courseCode}
                    course={c}
                    checked={enrolledCodes.has(c.courseCode)}
                    onToggle={() => onTogglePick(c.courseCode)}
                    subtitle={
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {c.credits} credits · auto-selected (tick to remove)
                      </div>
                    }
                  />
                ))}
              </div>
              {autoResult.attempts.length > 1 && (
                <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                  <summary className="cursor-pointer font-medium select-none">
                    Solver retry log ({autoResult.attempts.length} attempts)
                  </summary>
                  <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
                    {autoResult.attempts.map((a, i) => (
                      <li key={i}>
                        {a.selected.join(", ")} —{" "}
                        <span className={a.outcome === "sat" ? "text-emerald-600" : "text-red-500"}>
                          {a.outcome}
                        </span>{" "}
                        {a.note}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          )}
        </Card>
      )}

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
        <Btn variant="secondary" onClick={onBack}>
          ← Back
        </Btn>
        <Btn onClick={onNext} disabled={!canProceed}>
          {canProceed
            ? `Confirm ${enrolledCodes.size} subject${enrolledCodes.size === 1 ? "" : "s"} →`
            : "Pick at least one subject"}{" "}
        </Btn>
      </div>
      {enrolledCodes.size > 0 && (
        <p className="-mt-3 text-right text-[11px] text-slate-400">
          Next: confirm which section lists are alternatives vs mandatory combos.
        </p>
      )}
    </div>
  );
}
