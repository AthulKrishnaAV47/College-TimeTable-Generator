"use client";

import type { DraftSnapshot } from "./types";

/**
 * Local persistence (§5): current session + saved timetable drafts in
 * localStorage. Keyed and versioned so older shapes fail safe.
 */

const SESSION_KEY = "ttg:session:v1";
const DRAFTS_KEY = "ttg:drafts:v1";

export function loadSession<T>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveSession(state: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // storage full / private mode — persistence is best-effort
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

export function loadDrafts(): DraftSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DRAFTS_KEY);
    return raw ? (JSON.parse(raw) as DraftSnapshot[]) : [];
  } catch {
    return [];
  }
}

export function saveDrafts(drafts: DraftSnapshot[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    /* noop */
  }
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* --------------------------- demo sign-in --------------------------- */

export interface SessionUser {
  name: string;
  email: string;
}

const USER_KEY = "ttg:user:v1";

export function loadUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function saveUser(user: SessionUser): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* noop */
  }
}

export function clearUser(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(USER_KEY);
  } catch {
    /* noop */
  }
}
