"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/store";
import { passwordHint } from "@/lib/authValidation";
export default function LoginPage({ onLogin, reset = false }: { onLogin: () => void; reset?: boolean }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">(reset ? "reset" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ message?: string }>(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ name, email, password }) });
      setPassword("");
      if (mode === "login") onLogin();
      else { setMessage(result.message ?? "Check your email."); if (mode === "reset") { setMode("login"); history.replaceState(null, "", "/"); } }
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); }
    finally { setBusy(false); }
  }
  const title = { login: "Sign in", signup: "Create account", forgot: "Send reset link", reset: "Set new password" }[mode];
  return <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-5 py-12 md:grid-cols-2">
    <section><span className="rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-800">MyCamu term planner · Beta</span>
      <h1 className="mt-6 text-4xl font-extrabold text-slate-900">Your term.<br />Your timetable.</h1>
      <p className="mt-5 text-slate-600">Find conflict-free sections, keep completed courses out of your plan, and save private drafts across devices.</p>
    </section>
    <section className="rounded-3xl border bg-white p-7 shadow-xl">
      <h2 className="mb-5 text-2xl font-bold">{title}</h2>
      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" && <label className="block">Your name<input className="mt-1 w-full rounded-lg border p-3" required maxLength={80} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>}
        {mode !== "reset" && <label className="block">Email<input className="mt-1 w-full rounded-lg border p-3" type="email" required maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>}
        {mode !== "forgot" && <label className="block">{mode === "reset" ? "New password" : "Password"}<input className="mt-1 w-full rounded-lg border p-3" type="password" required minLength={mode === "login" ? 1 : 12} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} /></label>}
        {(mode === "signup" || mode === "reset") && <p className="text-xs text-slate-500">{passwordHint}</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-indigo-600 p-3 font-bold text-white disabled:opacity-50">{busy ? "Please wait…" : title}</button>
      </form>
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-indigo-700">{(["login", "signup", "forgot"] as const).filter(m => m !== mode).map(m => <button key={m} onClick={() => { setMode(m); setPassword(""); setError(""); setMessage(""); }}>{m === "login" ? "Sign in" : m === "signup" ? "Create account" : "Forgot password?"}</button>)}</div>
      <p className="mt-6 border-t pt-4 text-xs leading-relaxed text-slate-500">We store your email, profile, completed-course history and private drafts in Supabase. Submitted term datasets are shared after moderator approval; do not upload personal information. This independent beta is not affiliated with your college or MyCamu. Request account deletion from the account menu after signing in. <a className="underline" href="/privacy">Privacy details</a></p>
    </section>
  </main>;
}
