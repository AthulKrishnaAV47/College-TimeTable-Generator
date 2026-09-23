"use client";

import { useMemo, useState } from "react";
import type { DraftSnapshot } from "@/lib/types";
import type { GridBlock } from "@/lib/grid";
import { computeGridBlocks } from "@/lib/grid";
import TimetableGrid from "@/components/TimetableGrid";
import { Badge, Btn, Card, SectionTitle } from "@/components/ui";

/**
 * Step 6 (§6 milestone 8): save multiple timetable drafts and compare them
 * side by side before finalizing.
 */

interface Props {
  drafts: DraftSnapshot[];
  onUpdate: (drafts: DraftSnapshot[]) => void;
  onRestore: (d: DraftSnapshot) => void;
}

export default function DraftsStep({ drafts, onUpdate, onRestore }: Props) {
  const [compare, setCompare] = useState<Set<string>>(new Set());

  const toggleCompare = (id: string) => {
    setCompare((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  };

  const comparing = drafts.filter((d) => compare.has(d.id));

  const rename = (id: string) => {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    const label = window.prompt("Draft label", d.label);
    if (label !== null && label.trim()) {
      onUpdate(drafts.map((x) => (x.id === id ? { ...x, label: label.trim() } : x)));
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <SectionTitle hint="saved in this browser (localStorage)">
          Saved drafts ({drafts.length})
        </SectionTitle>
        {drafts.length === 0 ? (
          <p className="text-sm text-slate-400">
            No drafts yet — generate a timetable and hit “Save as draft”. The solver often finds
            several valid options; saving a few lets you compare them here.
          </p>
        ) : (
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5"
              >
                <input
                  type="checkbox"
                  checked={compare.has(d.id)}
                  onChange={() => toggleCompare(d.id)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  title="Select for side-by-side comparison"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{d.label}</span>
                    <Badge tone="blue">{d.profile.termLabel}</Badge>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {d.courseChoices.length} subjects · {d.metrics.weeklyContactHours} contact
                    hrs/wk · {d.metrics.freeDays} free days · {d.metrics.totalGaps}h gaps · saved{" "}
                    {new Date(d.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Btn variant="ghost" onClick={() => rename(d.id)} title="Rename">
                    Rename
                  </Btn>
                  <Btn variant="secondary" onClick={() => onRestore(d)}>
                    Restore
                  </Btn>
                  <Btn
                    variant="ghost"
                    className="text-red-500 hover:bg-red-50"
                    onClick={() => {
                      if (window.confirm(`Delete draft “${d.label}”?`)) {
                        onUpdate(drafts.filter((x) => x.id !== d.id));
                      }
                    }}
                  >
                    Delete
                  </Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {comparing.length >= 2 && (
        <Card className="p-5">
          <SectionTitle hint="same hour scale for honest comparison">
            Side-by-side comparison ({comparing.length})
          </SectionTitle>
          <div className="flex gap-4 overflow-x-auto pb-2 thin-scroll">
            {comparing.map((d) => (
              <ComparisonCard key={d.id} draft={d} />
            ))}
          </div>
        </Card>
      )}
      {comparing.length === 1 && (
        <p className="text-xs text-slate-400">Tick at least two drafts to compare.</p>
      )}
    </div>
  );
}

function ComparisonCard({ draft }: { draft: DraftSnapshot }) {
  const names: Record<string, string> = {};
  for (const c of draft.courseChoices) names[c.courseCode] = c.courseName;
  const blocks: GridBlock[] = useMemo(
    () => computeGridBlocks(draft.placements, names),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft]
  );
  const realCourses = draft.courseChoices.filter(
    (c) => (draft.placements[c.courseCode]?.busy.length ?? 0) > 0
  );
  const credits = draft.courseChoices.reduce(
    (s, c) => s + (c.credits ?? 0),
    0
  );
  return (
    <div className="min-w-[560px] flex-1">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700">{draft.label}</span>
        <span className="text-[11px] text-slate-400">
          {realCourses.length} subjects · {credits} cr · {draft.metrics.freeDays} free days ·{" "}
          {draft.metrics.totalGaps}h gaps
        </span>
      </div>
      <TimetableGrid blocks={blocks} rowHeight={44} />
    </div>
  );
}
