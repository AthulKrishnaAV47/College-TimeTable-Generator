import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceStore } from "../store";
import { DEFAULT_STATE } from "../appState";
afterEach(() => vi.unstubAllGlobals());
describe("account persistence", () => {
  it("serializes writes and sends the expected owner and server revision", async () => {
    let rev = 3;
    const fetch = vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method !== "PUT") return new Response(JSON.stringify({ state: null, drafts: [], revision: rev }));
      expect(new Headers(options.headers).get("X-Workspace-Owner")).toBe("alice");
      expect(JSON.parse(options.body as string).revision).toBe(rev);
      return new Response(JSON.stringify({ revision: ++rev }));
    });
    vi.stubGlobal("fetch", fetch);
    const store = createWorkspaceStore("alice"); await store.load();
    await Promise.all([store.save(DEFAULT_STATE, []), store.save(DEFAULT_STATE, [])]);
    expect(rev).toBe(5);
  });
  it("does not overwrite after a cross-device revision conflict", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: "revision conflict" }), { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    const store = createWorkspaceStore("alice");
    await expect(store.save(DEFAULT_STATE, [])).rejects.toThrow("revision conflict");
    await expect(store.save(DEFAULT_STATE, [])).rejects.toThrow("Another device");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
