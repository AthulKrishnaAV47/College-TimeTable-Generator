"use client";

import { useMemo, useState } from "react";
import type { Course, StudentProfile } from "@/lib/types";
import { normCode, resolveCompleted, matchesCourseSearch } from "@/lib/courseCodes";
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

  const entries = rawCompleted.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  const { codes: completed, unmatched } = resolveCompleted(entries, courses);

  const commit = (next: Partial<StudentProfile>) => {
    onChange({
      ...profile,
      ...next,
      completedCourseCodes: [...completed, ...unmatched],
    });
  };

  const [search, setSearch] = useState("");
  const filteredCourses = useMemo(() => {
    return courses.filter(c => matchesCourseSearch(c, search, courses));
  }, [courses, search]);

  const toggleCompleted = (code: string) => {
    const norm = normCode(code);
    const next = completed.includes(norm)
      ? completed.filter(c => c !== norm)
      : [...completed, norm];
    setRawCompleted([...next, ...unmatched].join(", ")); // sync raw state
    onChange({
      ...profile,
      completedCourseCodes: [...next, ...unmatched],
    });
  };

  const setYear = (year: StudentProfile["year"]) => {
    const termMatch = profile.termLabel.match(/Term\s*(\d)/i);
    const term = termMatch ? ` - Term ${termMatch[1]}` : " - Term 2";
    onChange({
      ...profile,
      year,
      termLabel: year === "I" ? `Year I${term}` : `Year II & III${term}`,
      completedCourseCodes: [...completed, ...unmatched],
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
                    ? "border-blue-600 bg-blue-600 text-slate-800"
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
            className="min-w-56 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle hint="Select the courses you have already completed. They will be excluded from your eligible list.">
          Already-completed courses
        </SectionTitle>
        <label className="mb-3 block text-sm">Completed course codes, names or abbreviations (comma separated)
          <textarea aria-label="Completed courses" className="mt-1 w-full rounded-lg border p-2" value={rawCompleted}
            onChange={e => {
              setRawCompleted(e.target.value);
              const entries = e.target.value.split(/[\n,;]+/).filter(s => s.trim());
              const result = resolveCompleted(entries, courses);
              onChange({ ...profile, completedCourseCodes: [...result.codes, ...result.unmatched] });
            }} />
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search offered courses by code or title..."
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
        />
        <div className="h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
          {filteredCourses.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">No courses match your search.</div>
          ) : (
            <div className="grid gap-1 sm:grid-cols-2">
              {filteredCourses.map((c) => {
                const checked = completed.includes(normCode(c.courseCode));
                return (
                  <label
                    key={c.courseCode}
                    className={`flex cursor-pointer items-start gap-2 rounded-md p-2 transition-colors hover:bg-slate-50 ${
                      checked ? "bg-blue-50" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCompleted(c.courseCode)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 text-sm">
                      <div className="font-semibold text-slate-800">{c.courseCode}</div>
                      <div className="line-clamp-1 text-xs text-slate-500" title={c.courseName}>
                        {c.courseName}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {completed.length > 0 && <Badge tone="blue">{completed.length} completed</Badge>}
          {unmatched.length > 0 && (
            <Badge tone="amber">
              Couldn’t match to a known course; choose from the list or correct/remove the entry: {unmatched.join(", ")}
            </Badge>
          )}
          {completed.length === 0 && <span className="text-slate-500">None yet — fine for Year I.</span>}
        </div>
      </Card>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
        <Btn variant="secondary" onClick={onBack}>
          ← Back
        </Btn>
        <Btn onClick={onNext} disabled={unmatched.length > 0}>See eligible subjects →</Btn>
      </div>
    </div>
  );
}
