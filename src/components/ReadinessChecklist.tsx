"use client";
import type { ReadinessReport } from "@/lib/readiness";
export default function ReadinessChecklist({
  report,
  acknowledged,
  onAcknowledge,
}: {
  report: ReadinessReport;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  return (
    <section
      aria-label="Enrollment-readiness checklist"
      className="space-y-3 rounded-xl border bg-white p-5"
    >
      <h3 className="text-lg font-bold">Enrollment-readiness checklist</h3>
      <p className="text-sm text-slate-600">
        These are your planning targets, not verified college requirements. A
        conflict-free timetable does not guarantee registration eligibility or
        available seats.
      </p>
      <p
        className={`font-semibold ${report.needsReview ? "text-amber-800" : "text-emerald-700"}`}
      >
        {report.blocked
          ? "Resolve blocking checks before exporting."
          : report.needsReview
            ? "Review the warnings before exporting."
            : "Planning checks pass — confirm with the official registration rules."}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {report.checks.map((check) => (
          <li
            key={check.id}
            className={`rounded-lg border p-3 text-sm ${check.status === "pass" ? "border-emerald-100 bg-emerald-50" : check.status === "blocked" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}
          >
            <strong>
              {check.status === "pass" ? "✓" : "!"} {check.label}
            </strong>
            <p>{check.detail}</p>
          </li>
        ))}
      </ul>
      {report.needsReview && !report.blocked && (
        <label className="flex items-start gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => onAcknowledge(e.target.checked)}
            className="mt-1"
          />
          I have reviewed these warnings and will verify requirements in MyCamu
          before enrolling.
        </label>
      )}
    </section>
  );
}
