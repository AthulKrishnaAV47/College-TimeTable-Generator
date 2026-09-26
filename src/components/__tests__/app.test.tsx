// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimetableApp from "@/components/TimetableApp";
import LoginPage from "@/components/LoginPage";
import ProfileStep from "@/components/steps/ProfileStep";
import { parseSlotSheet } from "@/lib/parse/slotSheet";
import { SAMPLE_SLOT_SHEET, SAMPLE_ELIGIBILITY } from "@/lib/sample";

const student = { id: "test-user", name: "Student", email: "student@example.com", verified: true, admin: false };
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/workspace") return new Response(JSON.stringify(options?.method === "PUT" ? { revision: 1 } : { state: null, drafts: [], revision: 0 }));
    if (url === "/api/aliases") return new Response(JSON.stringify({ aliases: [] }));
    if (url === "/api/datasets") return new Response(JSON.stringify({ datasets: [] }));
    return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/**
 * Full-wizard smoke test: sample data → parse → profile → pick subjects →
 * confirm section modes → solve → grid + side panel + exports + draft.
 */

function panel(title: string): HTMLElement {
  // Each FilePanel card contains its title in an h3
  const headings = screen.getAllByRole("heading", { level: 3 });
  const h = headings.find((el) => el.textContent?.includes(title));
  if (!h) throw new Error(`panel ${title} not found`);
  const card = h.closest("div.rounded-xl");
  if (!card) throw new Error(`card for ${title} not found`);
  return card as HTMLElement;
}

describe("TimetableApp wizard", () => {
  it("walks the full happy path with sample data", async () => {
    const user = userEvent.setup();
    render(<TimetableApp user={student} />);
    await screen.findByRole("heading", { level: 3, name: /File A/ });

    // Step 1: load sample data into both panels
    const slotPanel = panel("File A");
    await user.click(within(slotPanel).getByText("Load sample data"));
    expect(await within(slotPanel).findByText(/9 courses parsed/)).toBeTruthy();

    const eligPanel = panel("File B");
    await user.click(within(eligPanel).getByText("Load sample data"));
    expect(await within(eligPanel).findByText(/12 eligibility rows/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Continue to profile/ }));

    // Step 2: profile — defaults (Year I, Term 2 label, no completed) are fine
    await user.click(screen.getByRole("button", { name: /See eligible subjects/ }));

    // Step 3: subjects — tick four: 19AI301 (SBC), 19AI305, 19CS305, 19EE305 (FC)
    const tick = async (code: string) => {
      const cb = screen
        .getAllByRole("checkbox")
        .find((el) => !el.getAttribute("aria-label")?.startsWith("Must include") && el.closest("label")?.textContent?.includes(code));
      if (!cb) throw new Error(`checkbox for ${code} not found`);
      await user.click(cb);
    };
    await tick("19AI301");
    await tick("19AI305");
    await tick("19CS305");
    await tick("19EE305");

    expect(screen.getByText(/Confirm 4 subjects/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Confirm 4 subjects/ }));

    // Step 4: sections — heuristics: 19AI305 & 19EE305 = combos, others alternatives
    const activeButtons = (cls: string, label: string) =>
      screen
        .getAllByText(label)
        .filter((el) => el.className.includes(cls)).length;
    // 19CS305 & 19AI301 default to alternatives (blue), 19AI305 & 19EE305 to combos (purple)
    expect(activeButtons("bg-blue-600", "Alternatives — pick 1")).toBe(2);
    expect(activeButtons("bg-purple-600", "Required together — take all")).toBe(2);

    // No-class rules: exclude Saturday, then solve
    const satChip = screen.getByRole("button", { name: "Sat" });
    expect(satChip.getAttribute("aria-pressed")).toBe("false");
    await user.click(satChip);
    expect(satChip.getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: /Find conflict-free timetables/ }));

    // Step 5: grid + side panel
    expect(await screen.findByText(/valid timetables? found/)).toBeTruthy();
    expect(screen.getByText(/Contact hrs\/wk/)).toBeTruthy();
    expect(screen.getAllByText("Computer Architecture").length).toBeGreaterThan(0);

    // Save a draft
    await user.click(screen.getByRole("button", { name: /Save as draft/ }));
    expect(await screen.findByText("✓ Draft added — syncing")).toBeTruthy();

    // Drafts step
    await user.click(screen.getByRole("button", { name: /Drafts & compare/ }));
    expect(screen.getByText(/Saved drafts \(1\)/)).toBeTruthy();

    // Completing a course AFTER saving a draft must not be undone by Restore.
    await user.click(screen.getByRole("button", { name: /Your profile/ }));
    await user.type(screen.getByLabelText("Completed courses"), "19AI305");
    await user.click(screen.getByRole("button", { name: /Drafts & compare/ }));
    await user.click(screen.getByRole("button", { name: "Restore" }));
    const restoredCheckboxes = screen.getAllByRole("checkbox");
    expect(restoredCheckboxes.some(el => el.closest("label")?.textContent?.includes("19AI305"))).toBe(false);

  }, 30000);
});

describe("Real sign-in UI", () => {
  it("does not treat an email or password as a successful login without the server", async () => {
    const user = userEvent.setup(), onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);
    await user.type(screen.getByLabelText("Email"), "student@example.com");
    await user.type(screen.getByLabelText("Password"), "not-a-real-password");
    await user.click(screen.getByRole("button", { name: /^Sign in$/ }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Invalid credentials");
    expect(onLogin).not.toHaveBeenCalled();
    expect(localStorage.getItem("ttg:user:v1")).toBeNull();
  });
  it("offers signup and password reset flows", async () => {
    const user = userEvent.setup(); render(<LoginPage onLogin={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByLabelText("Your name")).toBeTruthy();
    expect(screen.getByText(/12–128 characters/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
  });
});

describe("Completion input", () => {
  it("resolves EMPD and blocks unknown/ambiguous entries with a visible warning", async () => {
    const user = userEvent.setup(), onChange = vi.fn();
    const course = { ...parseSlotSheet(SAMPLE_SLOT_SHEET).courses[0], courseCode: "19AI303", courseName: "Engineering Mechanics and Product Development" };
    render(<ProfileStep profile={{ year: "I", termLabel: "Term 2", completedCourseCodes: [] }} courses={[course]} onChange={onChange} onNext={() => {}} onBack={() => {}} />);
    await user.type(screen.getByLabelText("Completed courses"), "EMPD");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ completedCourseCodes: ["19AI303"] }));
    expect((screen.getByRole("button", { name: /See eligible/ }) as HTMLButtonElement).disabled).toBe(false);
    await user.type(screen.getByLabelText("Completed courses"), ", mystery");
    expect(screen.getByText(/Couldn’t match to a known course/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /See eligible/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
