import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
const mock = vi.hoisted(() => ({
  signInWithPassword: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn(), signOut: vi.fn(), updateUser: vi.fn(), resend: vi.fn(), requireUser: vi.fn(), rateLimit: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/server/supabase", () => ({ supabase: async () => ({ auth: mock, rpc: mock.rpc }), requireUser: mock.requireUser }));
vi.mock("@/lib/server/rateLimit", () => ({ rateLimit: mock.rateLimit }));
import { POST, GET } from "@/app/api/auth/[action]/route";
import { PUT as saveWorkspace } from "@/app/api/workspace/route";
import { ApiError } from "../server/http";
function request(action: string, body: unknown = {}) { return new Request(`https://app.example/api/auth/${action}`, { method: "POST", headers: { origin: "https://app.example", "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
async function auth(action: string, body?: unknown) { return POST(request(action, body), { params: Promise.resolve({ action }) }); }
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://app.example"); vi.clearAllMocks();
  mock.requireUser.mockRejectedValue(new ApiError(401, "Please sign in again."));
  for (const fn of [mock.signInWithPassword, mock.signUp, mock.resetPasswordForEmail, mock.signOut, mock.updateUser, mock.resend]) fn.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("auth endpoints", () => {
  it("validates signup server-side before calling the provider", async () => {
    expect((await auth("signup", { name: "Student", email: "s@", password: "Weak" })).status).toBe(400);
    expect(mock.signUp).not.toHaveBeenCalled();
    expect((await auth("signup", { name: "Student", email: "s@example.com", password: "Weak" })).status).toBe(400);
    const result = await auth("signup", { name: "Student", email: "s@example.com", password: "ValidPassword1!" });
    expect(result.status).toBe(200); expect(mock.signUp).toHaveBeenCalledOnce();
    expect(JSON.stringify(await result.json())).not.toContain("ValidPassword");
    expect(mock.rateLimit).toHaveBeenCalledTimes(5);
  });
  it("rejects wrong-password login and relies on the provider for valid credentials", async () => {
    mock.signInWithPassword.mockResolvedValue({ error: { message: "Invalid" } });
    expect((await auth("login", { email: "s@example.com", password: "bad" })).status).toBe(401);
    expect((await GET()).status).toBe(401);
    mock.signInWithPassword.mockResolvedValue({ error: null });
    expect((await auth("login", { email: "s@example.com", password: "ValidPassword1!" })).status).toBe(200);
  });
  it("invalidates provider sessions rather than clearing only client state", async () => {
    expect((await auth("logout")).status).toBe(200);
    expect(mock.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
  it("uses generic reset responses and requires a verified session for password update", async () => {
    expect((await auth("forgot", { email: "missing@example.com" })).status).toBe(200);
    expect(mock.resetPasswordForEmail).toHaveBeenCalledWith("missing@example.com", { redirectTo: "https://app.example" });
    expect((await auth("reset", { password: "NewPassword12!" })).status).toBe(401);
    expect(mock.updateUser).not.toHaveBeenCalled();
  });
  it("rejects CSRF and does not accept forged client identity for workspace writes", async () => {
    const noOrigin = new Request("https://app.example/api/auth/login", { method: "POST", body: "{}" });
    expect((await POST(noOrigin, { params: Promise.resolve({ action: "login" }) })).status).toBe(403);
    expect((await saveWorkspace(request("workspace"))).status).toBe(401);
    mock.requireUser.mockResolvedValue({ user: { id: "alice" }, db: { rpc: mock.rpc } });
    expect((await saveWorkspace(request("workspace", { user_id: "bob" }))).status).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
