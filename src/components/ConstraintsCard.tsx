"use client";

import { useState } from "react";
import type { ExcludedRange, ScheduleConstraints, Weekday } from "@/lib/types";
import { timeToMinutes } from "@/lib/time";
import { Card, SectionTitle } from "@/components/ui";

/**
 * Hard no-class rules (user request): exclude whole days ("no Saturday
 * class") and/or time windows ("no 3–5 class", "no 8–10 class"). The solver
 * only picks sections that respect every active rule; courses with no
 * rule-respecting section are reported in the failure diagnostics.
 */

const DAYS: Weekday[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const PRESETS: { label: string; range: ExcludedRange }[] = [
  { label: "No 08:00–10:00 classes", range: { start: "08:00", end: "10:00" } },
  { label: "No 15:00–17:00 classes (3–5 PM)", range: { start: "15:00", end: "17:00" } },
];

function fmtRange(r: ExcludedRange): string {
  return `${r.start}–${r.end}`;
}

export default function ConstraintsCard({
  constraints,
  onChange,
}: {
  constraints: ScheduleConstraints;
  onChange: (c: ScheduleConstraints) => void;
}) {
  const [customStart, setCustomStart] = useState("12:00");
  const [customEnd, setCustomEnd] = useState("14:00");
  const [error, setError] = useState<string | null>(null);

  const days = constraints.excludedDays ?? [];
  const ranges = constraints.excludedRanges ?? [];

  const sameRange = (a: ExcludedRange, b: ExcludedRange) =>
    a.start === b.start && a.end === b.end;

  const toggleDay = (d: Weekday) =>
    onChange({
      ...constraints,
      excludedDays: days.includes(d) ? days.filter((x) => x !== d) : [...days, d],
    });

  const togglePreset = (r: ExcludedRange) =>
    onChange({
      ...constraints,
      excludedRanges: ranges.some((x) => sameRange(x, r))
        ? ranges.filter((x) => !sameRange(x, r))
        : [...ranges, r],
    });

  const addCustom = () => {
    const r = { start: customStart, end: customEnd };
    if (timeToMinutes(r.start) >= timeToMinutes(r.end)) {
      setError("Window end must be after its start.");
      return;
    }
    if (ranges.some((x) => sameRange(x, r))) {
      setError("That window is already excluded.");
      return;
    }
    setError(null);
    onChange({ ...constraints, excludedRanges: [...ranges, r] });
  };

  const removeRange = (r: ExcludedRange) =>
    onChange({
      ...constraints,
      excludedRanges: ranges.filter((x) => !sameRange(x, r)),
    });

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? "border-red-500 bg-red-500 text-white"
        : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
    }`;

  return (
    <Card className="p-5">
      <SectionTitle hint="hard rules — only sections fully outside these are used; relax them if the solver can't fit everything">
        No-class rules
      </SectionTitle>

      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-500">No classes on these days</div>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <button
                key={d}
                aria-pressed={days.includes(d)}
                onClick={() => toggleDay(d)}
                className={chip(days.includes(d))}
              >
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-500">No classes in these windows</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                aria-pressed={ranges.some((x) => sameRange(x, p.range))}
                onClick={() => togglePreset(p.range)}
                className={chip(ranges.some((x) => sameRange(x, p.range)))}
              >
                {p.label}
              </button>
            ))}
            {ranges
              .filter((r) => !PRESETS.some((p) => sameRange(p.range, r)))
              .map((r) => (
                <button
                  key={`${r.start}-${r.end}`}
                  onClick={() => removeRange(r)}
                  className="rounded-full border border-red-500 bg-red-500 px-3 py-1.5 text-xs font-medium text-white"
                  title="Click to remove"
                >
                  No {fmtRange(r)} ✕
                </button>
              ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Custom window</span>
            <input
              type="time"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="time"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={addCustom}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              + Exclude
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>

        {days.length === 0 && ranges.length === 0 ? (
          <p className="text-[11px] text-slate-400">
            Nothing excluded — every section of every subject is a candidate.
          </p>
        ) : (
          <p className="text-[11px] text-red-600">
            Excluding: {[
              days.length > 0 ? days.map((d) => d.slice(0, 3)).join(", ") : null,
              ranges.length > 0 ? ranges.map(fmtRange).join(", ") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
    </Card>
  );
}
