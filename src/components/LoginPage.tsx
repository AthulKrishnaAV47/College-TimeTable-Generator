"use client";

import { useState, type FormEvent } from "react";
import type { SessionUser } from "@/lib/store";

/**
 * Demo sign-in gate: keeps the app a zero-backend static site while giving
 * each student a named session. Credentials are validated client-side and
 * the profile lives only in this browser's localStorage.
 */
export default function LoginPage({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const em = email.trim().toLowerCase();
    if (!n) {
      setError("Please enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    setError(null);
    onLogin({ name: n, email: em });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-10 px-4 py-12 lg:flex-row lg:justify-between">
      {/* Brand / value panel */}
      <section className="max-w-md text-center lg:text-left">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/70 px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-blue-600" />
          MyCamu slot-sheet planner
        </div>
        <h1 className="title-gradient text-4xl font-extrabold tracking-tight sm:text-5xl">
          Term Timetable Generator
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600">
          Turn your term slot sheet into a <strong>valid, conflict-free weekly timetable</strong> —
          100% of contact hours, zero collisions, your no-class rules respected (or a honest
          closest-match when they can&apos;t be).
        </p>
        <ul className="mt-6 space-y-2 text-sm text-slate-600">
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 text-emerald-600">✓</span>
            Parses the real MyCamu PDF export + SBC/FC eligibility table
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 text-emerald-600">✓</span>
            Auto-picks a schedulable subject subset with ranked options
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 text-emerald-600">✓</span>
            Exports PNG &amp; .ics calendar, saves drafts to compare
          </li>
        </ul>
      </section>

      {/* Sign-in card */}
      <section className="w-full max-w-md">
        <form
          onSubmit={submit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-300/40 sm:p-8"
        >
          <h2 className="text-xl font-bold text-slate-900">Sign in</h2>
          <p className="mt-1 text-xs text-slate-500">
            Demo sign-in — any name/email/password works and never leaves this browser.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-name" className="mb-1 block text-sm font-medium text-slate-700">
                Your name
              </label>
              <input
                id="login-name"
                type="text"
                autoComplete="name"
                placeholder="e.g. Athul"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@college.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="At least 4 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-blue-700"
          >
            Sign in
          </button>
          <p className="mt-3 text-center text-[11px] text-slate-400">
            Your session, drafts and uploads stay in localStorage on this device.
          </p>
        </form>
      </section>
    </main>
  );
}
