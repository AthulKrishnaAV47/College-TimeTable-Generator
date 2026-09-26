import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
const mock = vi.hoisted(() => ({ createServerClient: vi.fn(), getUser: vi.fn(), rpc: vi.fn(), set: vi.fn(), getAll: vi.fn(() => []) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mock.createServerClient }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: mock.getAll, set: mock.set }) }));
import { requireUser, supabase } from "../server/supabase";
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("SUPABASE_ANON_KEY", "public-key");
  mock.createServerClient.mockReturnValue({ auth: { getUser: mock.getUser }, rpc: mock.rpc });
  mock.getUser.mockResolvedValue({ data: { user: { id: "alice" } }, error: null });
});
describe("server sessions", () => {
  it("rejects a valid-looking user JWT whose provider session was revoked", async () => {
    mock.rpc.mockResolvedValue({ data: false, error: null });
    await expect(requireUser()).rejects.toThrow("expired");
    mock.rpc.mockResolvedValue({ data: true, error: null });
    expect((await requireUser()).user.id).toBe("alice");
  });
  it("sets Secure HttpOnly SameSite cookies in production, including refreshed cookies", async () => {
    vi.stubEnv("NODE_ENV", "production"); await supabase();
    const options = mock.createServerClient.mock.calls.at(-1)![2];
    expect(options.cookieOptions).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax" });
    options.cookies.setAll([{ name: "session", value: "opaque", options: { httpOnly: false, secure: false } }]);
    expect(mock.set).toHaveBeenCalledWith("session", "opaque", expect.objectContaining({ secure: true, httpOnly: true, sameSite: "lax" }));
    vi.unstubAllEnvs();
  });
});
