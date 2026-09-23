"use client";

import { Fragment, useRef, useState } from "react";
import { parseSlotSheet } from "@/lib/parse/slotSheet";
import { parseEligibilityTable } from "@/lib/parse/eligibility";
import { SAMPLE_SLOT_SHEET, SAMPLE_ELIGIBILITY } from "@/lib/sample";
import type { ParsedEligibility, ParsedSlotSheet } from "@/lib/appState";
import { Badge, Btn, Card, Spinner, WarningsList } from "@/components/ui";

/**
 * Step 1 (§6 milestone 2): upload/paste both files and sanity-check the
 * extraction before anything downstream uses it. PDFs go through the
 * server route (/api/parse); pasted text is parsed locally with the exact
 * same pure functions.
 */

interface Props {
  slotSheet: ParsedSlotSheet | null;
  eligibility: ParsedEligibility | null;
  onSlotSheet: (p: ParsedSlotSheet) => void;
  onEligibility: (p: ParsedEligibility) => void;
  onNext: () => void;
}

type ParseError = { slotSheet?: string; eligibility?: string };

function FilePanel({
  kind,
  title,
  subtitle,
  parsed,
  onParsed,
  error,
  setError,
}: {
  kind: "slotSheet" | "eligibility";
  title: string;
  subtitle: string;
  parsed: ParsedSlotSheet | ParsedEligibility | null;
  onParsed: (p: ParsedSlotSheet | ParsedEligibility) => void;
  error?: string;
  setError: (kind: "slotSheet" | "eligibility", msg?: string) => void;
}) {
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseText = (text: string) => {
    if (kind === "slotSheet") {
      const res = parseSlotSheet(text);
      if (res.courses.length === 0) {
        setError(kind, "No course blocks found — check that this is the MyCamu 'course overview' export.");
        return;
      }
      setError(kind, undefined);
      onParsed({ ...res, text });
    } else {
      const res = parseEligibilityTable(text);
      if (res.rows.length === 0) {
        setError(kind, "No eligibility rows found — expected rows like '19AI301 | SBC | I'.");
        return;
      }
      setError(kind, undefined);
      onParsed({ ...res, text });
    }
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(kind, undefined);
    try {
      if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
        const form = new FormData();
        form.append("kind", kind);
        form.append("file", file);
        const res = await fetch("/api/parse", { method: "POST", body: form });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Server-side extraction failed.");
        setPaste(body.text as string);
        parseText(body.text as string);
      } else {
        const text = await file.text();
        setPaste(text);
        parseText(text);
      }
    } catch (e) {
      setError(kind, e instanceof Error ? e.message : "Could not read this file.");
    } finally {
      setBusy(false);
    }
  };

  const summary = () => {
    if (!parsed) return null;
    if (kind === "slotSheet") {
      const p = parsed as ParsedSlotSheet;
      const sections = p.courses.reduce((s, c) => s + c.sections.length, 0);
      return (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="green">✓ {p.courses.length} courses parsed</Badge>
          <Badge tone="blue">{sections} sections</Badge>
          {p.courses.some((c) => c.sections.some((s) => s.selfPaced)) && (
            <Badge tone="purple">
              {p.courses.reduce((n, c) => n + c.sections.filter((s) => s.selfPaced).length, 0)} self-paced
            </Badge>
          )}
        </div>
      );
    }
    const p = parsed as ParsedEligibility;
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="green">✓ {p.rows.length} eligibility rows</Badge>
        <Badge tone="blue">{new Set(p.rows.map((r) => r.courseCode)).size} unique codes</Badge>
        {p.rows.some((r) => r.year === "II & III") && <Badge tone="amber">includes II &amp; III rows</Badge>}
      </div>
    );
  };

  return (
    <Card className="flex flex-col p-5">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <button
          className="text-xs font-medium text-blue-600 hover:underline"
          onClick={() => {
            const text = kind === "slotSheet" ? SAMPLE_SLOT_SHEET : SAMPLE_ELIGIBILITY;
            setPaste(text);
            parseText(text);
          }}
        >
          Load sample data
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-500">{subtitle}</p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        onClick={() => fileRef.current?.click()}
        className="mb-3 cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-xs text-slate-500 transition-colors hover:border-blue-400 hover:bg-blue-50/40"
      >
        {busy ? (
          <Spinner label="Extracting text…" />
        ) : (
          <>
            <span className="font-medium text-slate-600">Drop the file here</span> or click to
            browse — PDF (parsed server-side), .txt or .csv
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.csv,application/pdf,text/plain,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        placeholder={
          kind === "slotSheet"
            ? "…or paste the extracted text:\n19AI305 [3 Credits]\nENGINEERING SCIENCES - …\nCourse overview\nAdvanced C Programming\nUG - 04, T1-P3, AI - Trainer 10 .\nDate: 21-01-2026 to 28-03-2026\nFriday: 15:00 - 16:0016:00 - 17:00\n…"
            : "…or paste the eligibility table:\nCourse Code | SBC or FC | Year\n19AI301 | SBC | I\n19CS305 | FC | II & III"
        }
        spellCheck={false}
        className="h-36 w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-2.5 font-mono text-[11px] leading-snug text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none"
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <Btn onClick={() => parseText(paste)} disabled={!paste.trim() || busy}>
          {parsed ? "Re-parse text" : "Parse text"}
        </Btn>
        {summary()}
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {parsed && (
        <div className="mt-3 space-y-2">
          <WarningsList warnings={parsed.warnings} />
          {kind === "slotSheet" ? (
            <SlotSheetPreview parsed={parsed as ParsedSlotSheet} />
          ) : (
            <EligibilityPreview parsed={parsed as ParsedEligibility} />
          )}
        </div>
      )}
    </Card>
  );
}

function SlotSheetPreview({ parsed }: { parsed: ParsedSlotSheet }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 thin-scroll">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-slate-50 text-slate-500">
          <tr>
            <th className="px-2.5 py-1.5 font-medium">Code</th>
            <th className="px-2.5 py-1.5 font-medium">Course</th>
            <th className="px-2 py-1.5 font-medium">Cr</th>
            <th className="px-2 py-1.5 font-medium">Sections</th>
            <th className="px-2 py-1.5 font-medium">Hrs/wk</th>
          </tr>
        </thead>
        <tbody>
          {parsed.courses.map((c) => {
            const hrs = c.sections.reduce((s, x) => s + x.weeklyHours, 0);
            const realHrs = c.sections.reduce(
              (s, x) => s + x.weeklyCells.filter((cell) => !x.selfPaced).length,
              0
            );
            return (
              <Fragment key={c.courseCode}>
                <tr
                  className="cursor-pointer border-t border-slate-100 hover:bg-blue-50/50"
                  onClick={() => setOpen(open === c.courseCode ? null : c.courseCode)}
                >
                  <td className="px-2.5 py-1.5 font-mono font-medium">{c.courseCode}</td>
                  <td className="max-w-[220px] truncate px-2.5 py-1.5" title={c.courseName}>
                    {c.courseName}
                  </td>
                  <td className="px-2 py-1.5">{c.credits}</td>
                  <td className="px-2 py-1.5">
                    {c.sections.length}
                    {c.sectionMode === "mandatory-combo" && (
                      <span className="ml-1 text-[10px] text-purple-600">combo</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {realHrs}
                    {realHrs !== hrs && <span className="text-slate-400"> (+{hrs - realHrs} ph)</span>}
                  </td>
                </tr>
                {open === c.courseCode &&
                  c.sections.map((s) => (
                    <tr key={`${c.courseCode}-${s.slotCode}`} className="border-t border-slate-100 bg-slate-50/60">
                      <td className="px-2.5 py-1" />
                      <td className="px-2.5 py-1 font-mono text-[10.5px] text-slate-600" colSpan={4}>
                        {s.slotCode} · {s.batch} · {s.faculty.join(", ") || "—"} ·{" "}
                        {s.weeklyCells
                          .map((cell) => `${cell.day.slice(0, 3)} ${cell.startTime}–${cell.endTime}`)
                          .join(", ") || "no fixed time"}
                        {s.selfPaced && <span className="ml-1 text-purple-600">[self-paced]</span>}
                      </td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EligibilityPreview({ parsed }: { parsed: ParsedEligibility }) {
  return (
    <div className="max-h-44 overflow-auto rounded-lg border border-slate-200 thin-scroll">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-slate-50 text-slate-500">
          <tr>
            <th className="px-2.5 py-1.5 font-medium">Course Code</th>
            <th className="px-2.5 py-1.5 font-medium">Type</th>
            <th className="px-2.5 py-1.5 font-medium">Year</th>
          </tr>
        </thead>
        <tbody>
          {parsed.rows.map((r, i) => (
            <tr key={`${r.courseCode}-${r.year}-${i}`} className="border-t border-slate-100">
              <td className="px-2.5 py-1 font-mono">{r.courseCode}</td>
              <td className="px-2.5 py-1">
                <Badge tone={r.type === "SBC" ? "blue" : "green"}>{r.type}</Badge>
              </td>
              <td className="px-2.5 py-1">{r.year}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DataStep({ slotSheet, eligibility, onSlotSheet, onEligibility, onNext }: Props) {
  const [errors, setErrors] = useState<ParseError>({});
  const setError = (kind: "slotSheet" | "eligibility", msg?: string) =>
    setErrors((prev) => ({ ...prev, [kind]: msg }));

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <FilePanel
          kind="slotSheet"
          title="File A — MyCamu term slot sheet"
          subtitle="The term-specific 'course overview' PDF export: every course offered this term with its sections, faculty and weekly day/time pattern."
          parsed={slotSheet}
          onParsed={(p) => onSlotSheet(p as ParsedSlotSheet)}
          error={errors.slotSheet}
          setError={setError}
        />
        <FilePanel
          kind="eligibility"
          title="File B — SBC / FC eligibility table"
          subtitle="Two/three-column table mapping each course code to SBC or FC and the year level (I, or II & III). Duplicates across year levels are preserved."
          parsed={eligibility}
          onParsed={(p) => onEligibility(p as ParsedEligibility)}
          error={errors.eligibility}
          setError={setError}
        />
      </div>
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-xs text-slate-500">
          Both files parsed? The next step asks for your year, term label and completed subjects.
        </p>
        <Btn onClick={onNext} disabled={!slotSheet || !eligibility}>
          Continue to profile →
        </Btn>
      </div>
    </div>
  );
}
