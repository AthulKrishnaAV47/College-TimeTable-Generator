"use client";
import { useCallback, useEffect, useState } from "react";
import TimetableApp from "@/components/TimetableApp";
import LoginPage from "@/components/LoginPage";
import { api, RequestError, type SessionUser } from "@/lib/store";
export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [reset, setReset] = useState(false);
  const refresh = useCallback(async () => {
    try { const data = await api<{ user: SessionUser }>("/api/auth/session"); setUser(data.user); setError(""); }
    catch (e) { setUser(null); if (!(e instanceof RequestError && e.status === 401)) setError(e instanceof Error ? e.message : "Unable to load account."); }
    finally { setReady(true); }
  }, []);
  useEffect(() => { setReset(new URLSearchParams(location.search).has("reset")); if (location.search.includes("authError")) setError("This email link is invalid or expired. Request a new one."); void refresh(); }, [refresh]);
  if (!ready) return <p className="p-10" role="status">Checking your session…</p>;
  return <>{error && <p role="alert" className="bg-amber-50 p-4 text-center text-amber-900">{error}</p>}
    {!user || reset ? <LoginPage reset={reset} onLogin={() => { setReset(false); void refresh(); }} /> : <TimetableApp key={user.id} user={user} onLogout={async () => {
      try { await api("/api/auth/logout", { method: "POST", body: "{}" }); setUser(null); }
      catch (e) { setError(e instanceof Error ? e.message : "Sign-out failed. Please retry."); }
    }} />}
  </>;
}
