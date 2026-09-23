"use client";

import { useEffect, useState } from "react";
import TimetableApp from "@/components/TimetableApp";
import LoginPage from "@/components/LoginPage";
import { clearUser, loadUser, saveUser, type SessionUser } from "@/lib/store";

export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(loadUser());
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!user) {
    return (
      <LoginPage
        onLogin={(u) => {
          saveUser(u);
          setUser(u);
        }}
      />
    );
  }

  return (
    <TimetableApp
      user={user}
      onLogout={() => {
        clearUser();
        setUser(null);
      }}
    />
  );
}
