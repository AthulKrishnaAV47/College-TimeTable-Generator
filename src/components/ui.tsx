"use client";

import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white shadow-md shadow-slate-200/60 ${className}`}>
      {children}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  className = "",
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  disabled?: boolean;
  className?: string;
  title?: string;
  type?: "button" | "submit";
}) {
  const styles: Record<string, string> = {
    primary:
      "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 shadow-md shadow-blue-600/20",
    secondary:
      "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed shadow-sm",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 disabled:text-slate-300",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 shadow-md shadow-red-600/20",
    success:
      "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300 shadow-md shadow-emerald-600/20",
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "slate",
  className = "",
}: {
  children: ReactNode;
  tone?: "slate" | "blue" | "green" | "amber" | "red" | "purple";
  className?: string;
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600 border-slate-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="text-sm font-bold tracking-wide text-slate-500 uppercase">
        {children}
      </h3>
      {hint ? <div className="text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm shadow-slate-100">
      <div className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">
        {label}
      </div>
      <div className="text-xl font-bold text-slate-800">{value}</div>
    </div>
  );
}

export function WarningsList({
  warnings,
  title = "Parser notes",
}: {
  warnings: string[];
  title?: string;
}) {
  if (warnings.length === 0) {
    return (
      <p className="text-xs text-emerald-600">
        ✓ Clean parse — no irregularities found.
      </p>
    );
  }
  return (
    <details className="group rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <summary className="cursor-pointer font-medium select-none">
        ⚠ {title} ({warnings.length}) — click to review
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </details>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      {label}
    </span>
  );
}
