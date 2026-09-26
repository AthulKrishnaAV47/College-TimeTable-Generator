import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
import { checkOrigin, readBody } from "../server/http";
import { validateUpload, MAX_FILE_BYTES } from "../uploads";
import { emailSchema, passwordSchema } from "../authValidation";
import { rateLimit } from "../server/rateLimit";
import { workspaceSchema } from "../validation";
import { DEFAULT_STATE } from "../appState";
afterEach(() => vi.unstubAllEnvs());
describe("request hardening", () => {
  it("requires exact same-origin writes", () => {
    vi.stubEnv("APP_URL", "https://scheduler.example");
    expect(() => checkOrigin(new Request("https://scheduler.example/api", { headers: { origin: "https://evil.example" } }))).toThrow("origin");
    expect(() => checkOrigin(new Request("https://scheduler.example/api"))).toThrow("origin");
    expect(() => checkOrigin(new Request("https://scheduler.example/api", { headers: { origin: "https://scheduler.example" } }))).not.toThrow();
  });
  it("limits streamed body size even without Content-Length", async () => {
    await expect(readBody(new Request("https://scheduler.example/api", { method: "POST", body: "123456789" }), 5)).rejects.toThrow("too large");
  });
  it("requires PDF extension, MIME and signature, and rejects oversized/binary files", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7 test");
    expect(validateUpload("term.pdf", "application/pdf", bytes)).toBe("pdf");
    expect(() => validateUpload("term.pdf", "image/png", bytes)).toThrow();
    expect(() => validateUpload("term.pdf", "application/pdf", new Uint8Array([1, 2]))).toThrow();
    expect(() => validateUpload("term.txt", "text/plain", new Uint8Array([0, 2]))).toThrow();
    expect(() => validateUpload("term.pdf", "application/pdf", new Uint8Array(MAX_FILE_BYTES + 1))).toThrow();
  });
  it("validates real email format and password strength", () => {
    expect(emailSchema.safeParse("student@").success).toBe(false);
    expect(passwordSchema.safeParse("short1!").success).toBe(false);
    expect(passwordSchema.safeParse("ThisIsAStrong123!").success).toBe(true);
  });
  it("rejects malformed workspace/draft payloads and strips client owner IDs", () => {
    expect(workspaceSchema.safeParse({ state: DEFAULT_STATE, drafts: [{ id: "fake" }], revision: 0 }).success).toBe(false);
    expect(workspaceSchema.parse({ state: DEFAULT_STATE, drafts: [], revision: 0, user_id: "other" })).not.toHaveProperty("user_id");
  });
  it("rate-limits development requests and fails closed in production without Redis", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", ""); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", ""); vi.stubEnv("NODE_ENV", "development");
    const req = new Request("https://scheduler.example");
    await rateLimit(req, "unit-test", "id", 1);
    await expect(rateLimit(req, "unit-test", "id", 1)).rejects.toThrow("Too many");
    vi.stubEnv("NODE_ENV", "production");
    await expect(rateLimit(req, "production-test")).rejects.toThrow("configured");
  });
});
