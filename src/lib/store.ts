"use client";
import type { AppState } from "./appState";
import type { DraftSnapshot } from "./types";
import { DEFAULT_STATE } from "./appState";
import { workspaceSchema } from "./validation";

export interface SessionUser { id: string; name: string; email: string; verified: boolean; admin: boolean }
export class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T = Record<string, unknown>>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers }, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new RequestError(response.status, body.error ?? "Request failed.");
  return body as T;
}
export const newId = () => crypto.randomUUID();

export function createWorkspaceStore(userId: string) {
  let revision = 0;
  let queue = Promise.resolve();
  let conflicted = false;
  const headers = { "X-Workspace-Owner": userId };
  return {
    async load() {
      const data = await api<{ state: Partial<AppState> | null; drafts: DraftSnapshot[]; revision: number }>("/api/workspace", { headers });
      revision = data.revision;
      return { state: { ...DEFAULT_STATE, ...data.state, step: data.state?.step === 4 ? 3 : data.state?.step ?? 0 }, drafts: data.drafts };
    },
    save(state: AppState, drafts: DraftSnapshot[]) {
      const task = queue.then(async () => {
        if (conflicted) throw new RequestError(409, "Another device changed this workspace. Export your unsaved work and reload.");
        const payload = workspaceSchema.parse({ state, drafts, revision });
        try {
          const result = await api<{ revision: number }>("/api/workspace", { method: "PUT", headers, body: JSON.stringify(payload) });
          revision = result.revision;
        } catch (e) { if (e instanceof RequestError && e.status === 409) conflicted = true; throw e; }
      });
      queue = task.catch(() => {});
      return task;
    },
  };
}

/** Explicit, user-confirmed import only: old browser data has no reliable owner. */
export function readLegacyWorkspace() {
  const raw = localStorage.getItem("ttg:session:v1");
  if (!raw) throw new Error("No legacy session found in this browser.");
  const parsed = workspaceSchema.parse({ state: { ...DEFAULT_STATE, ...JSON.parse(raw) }, drafts: JSON.parse(localStorage.getItem("ttg:drafts:v1") ?? "[]"), revision: 0 });
  return { state: { ...DEFAULT_STATE, ...parsed.state, step: 0 }, drafts: parsed.drafts };
}
export function clearLegacyWorkspace() {
  for (const key of ["ttg:session:v1", "ttg:drafts:v1", "ttg:user:v1"]) localStorage.removeItem(key);
}
