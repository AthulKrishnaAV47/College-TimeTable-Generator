"use client";

import { useMemo, useState } from "react";
import type { Course, StudentProfile } from "@/lib/types";
import { normCode } from "@/lib/eligibility";
import { Badge, Btn, Card, SectionTitle } from "@/components/ui";

/**
 * Step 2 (§3.1): current year (matches File B exactly), term label
 * (record-keeping only — File B has no term column), and the completed-course
 * history used to exclude subjects.
 */

interface Props {
  profile: StudentProfile;
  courses: Course[];
  onChange: (p: StudentProfile) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function ProfileStep({ profile, courses, onChange, onNext, onBack }: Props) {
  const [rawCompleted, setRawCompleted] = useState(profile.completedCourseCodes.join(", "));

  const offeredCodes = useMemo(
    () => new Set(courses.map((c) => normCode(c.courseCode))),
    [courses]
  );

  const completed = useMemo(
    () =>
      rawCompleted
        .split(/[\n,;]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0),
    [rawCompleted]
  );

  const unmatched = completed.filter((c) => !offeredCodes.has(c));

  const commit = (next: Partial<StudentProfile>) => {
    onChange({
      ...profile,
      ...next,
      completedCourseCodes: completed,
    });
  };

  const setYear = (year: StudentProfile["year"]) => {
    const termMatch = profile.termLabel.match(/Term\s*(\d)/i);
    const term = termMatch ? ` - Term ${termMatch[1]}` : " - Term 2";
    onChange({
      ...profile,
      year,
      termLabel: year === "I" ? `Year I${term}` : `Year II & III${term}`,
      completedCourseCodes: completed,
    });
  };

  const setTerm = (n: 1 | 2) => {
    const label =
      profile.year === "I" ? `Year I - Term ${n}` : `Year II & III - Term ${n}`;
    commit({ termLabel: label });
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <SectionTitle hint="File B's Year column uses exactly these values">
          Current year
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { id: "I", title: "Year I", desc: "Year I eligibility rows only" },
              {
                id: "II & III",
                title: "Year II & III",
                desc: "Senior rows plus every Year I subject",
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setYear(opt.id)}
              className={`rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                profile.year === opt.id
                  ? "border-blue-600 bg-blue-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="font-semibold text-slate-800">{opt.title}</div>
              <div className="text-xs text-slate-500">{opt.desc}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle hint="A label for your own tracking & saved drafts — it does not filter the eligibility table, which encodes no term info">
          Term within the semester
        </SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2].map((n) => {
            const label = profile.year === "I" ? `Year I - Term ${n}` : `Year II & III - Term ${n}`;
            const active = profile.termLabel === label;
            return (
              <button
                key={n}
                onClick={() => setTerm(n as 1 | 2)}
                className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Term {n}
              </button>
            );
          })}
          <input
            value={profile.termLabel}
            onChange={(e) => commit({ termLabel: e.target.value })}
            placeholder="Custom label, e.g. Year I - Term 2 Schedule"
            className="min-w-56 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle hint="Comma or newline separated — excludes these from auto-selection and the eligible list">
          Already-completed courses
        </SectionTitle>
        <textarea
          value={rawCompleted}
          onChange={(e) => {
            setRawCompleted(e.target.value);
            const codes = e.target.value
              .split(/[\n,;]+/)
              .map((s) => s.trim().toUpperCase())
              .filter((s) => s.length > 0);
            commit({ completedCourseCodes: codes });
          }}
          placeholder={"e.g.\n19AI301, 19AI302\n19EE304"}
          spellCheck={false}
          className="h-24 w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-2.5 font-mono text-xs focus:border-blue-500 focus:bg-white focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {completed.length > 0 && <Badge tone="blue">{completed.length} completed</Badge>}
          {unmatched.length > 0 && (
            <Badge tone="amber">
              not offered this term (kept in history): {unmatched.join(", ")}
            </Badge>
          )}
          {completed.length === 0 && <span className="text-slate-400">None yet — fine for Year I.</span>}
        </div>
      </Card>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
        <Btn variant="secondary" onClick={onBack}>
          ← Back
        </Btn>
        <Btn onClick={onNext}>See eligible subjects →</Btn>
      </div>
    </div>
  );
}
