"use client";

import type { GridBlock } from "@/lib/grid";
import { GRID_DAYS, PALETTE, gridRange } from "@/lib/grid";
import { timeToMinutes } from "@/lib/time";

/**
 * Weekly grid: Mon–Sat columns, hourly rows derived from the actual parsed
 * time cells (never hardcoded). Blocks are absolutely positioned inside each
 * day column so multi-hour and sub-hour classes render correctly.
 */
export default function TimetableGrid({
  blocks,
  rowHeight = 64,
  className = "",
}: {
  blocks: GridBlock[];
  rowHeight?: number;
  className?: string;
}) {
  const { start, end } = gridRange(blocks);
  const rows = Math.max(1, end - start);
  const totalMin = rows * 60;

  const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}>
      <div className="grid" style={{ gridTemplateColumns: "64px repeat(6, minmax(112px, 1fr))" }}>
        {/* Header row */}
        <div className="border-b border-slate-200 bg-slate-50" />
        {GRID_DAYS.map((d) => (
          <div
            key={d}
            className="border-b border-l border-slate-200 bg-slate-800 py-2 text-center text-[13px] font-semibold tracking-wide text-white uppercase"
          >
            {d.slice(0, 3)}
          </div>
        ))}

        {/* Time labels + day columns */}
        <div className="relative" style={{ height: rows * rowHeight }}>
          {Array.from({ length: rows }, (_, r) => (
            <div
              key={r}
              className="absolute right-1.5 -translate-y-1/2 text-[11px] font-medium text-slate-400"
              style={{ top: r * rowHeight + rowHeight / 2 }}
            >
              {fmt(start + r)}
            </div>
          ))}
        </div>
        {GRID_DAYS.map((day) => {
          const dayBlocks = blocks.filter((b) => b.day === day);
          return (
            <div
              key={day}
              className="relative border-l border-slate-200"
              style={{ height: rows * rowHeight }}
            >
              {Array.from({ length: rows }, (_, r) => (
                <div
                  key={r}
                  className={`absolute inset-x-0 border-b border-slate-100 ${r % 2 === 0 ? "bg-slate-50/60" : ""}`}
                  style={{ top: r * rowHeight, height: rowHeight }}
                />
              ))}
              {dayBlocks.map((b, i) => {
                const startMin = timeToMinutes(b.startTime);
                const endMin = timeToMinutes(b.endTime);
                const top = ((startMin - start * 60) / totalMin) * rows * rowHeight;
                const height = Math.max(
                  20,
                  ((endMin - startMin) / totalMin) * rows * rowHeight
                );
                const color = PALETTE[b.colorIndex % PALETTE.length];
                const showFaculty = height >= 50;
                const showName = height >= 34;
                return (
                  <div
                    key={`${b.courseCode}-${i}`}
                    title={`${b.courseCode} ${b.courseName}\n${b.startTime}–${b.endTime} · ${b.faculty || "Faculty TBD"}\nSection ${b.slotCode} (${b.batch})`}
                    className="absolute inset-x-0.5 overflow-hidden rounded-lg border px-2 py-1 shadow-sm"
                    style={{
                      top: top + 1,
                      height: height - 2,
                      background: color.bg,
                      borderColor: color.border,
                      color: color.text,
                    }}
                  >
                    <div className="truncate text-xs leading-tight font-bold">
                      {b.courseCode} · {b.slotCode}
                    </div>
                    {showName && (
                      <div className="truncate text-[11.5px] leading-tight">{b.courseName}</div>
                    )}
                    {showFaculty && (
                      <div
                        className="truncate text-[10.5px] leading-tight"
                        style={{ color: color.border }}
                      >
                        {b.faculty || "Faculty TBD"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
