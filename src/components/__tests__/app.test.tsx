// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimetableApp from "@/components/TimetableApp";
import LoginPage from "@/components/LoginPage";
import Home from "@/app/page";
import { SAMPLE_SLOT_SHEET, SAMPLE_ELIGIBILITY } from "@/lib/sample";

/**
 * Full-wizard smoke test: sample data → parse → profile → pick subjects →
 * confirm section modes → solve → grid + side panel + exports + draft.
 */

function panel(title: string): HTMLElement {
  // Each FilePanel card contains its title in an h3
  const headings = screen.getAllByRole("heading", { level: 3 });
  const h = headings.find((el) => el.textContent?.includes(title));
  if (!h) throw new Error(`panel ${title} not found`);
  const card = h.closest("div.rounded-2xl");
  if (!card) throw new Error(`card for ${title} not found`);
  return card as HTMLElement;
}

describe("TimetableApp wizard", () => {
  it("walks the full happy path with sample data", async () => {
    const user = userEvent.setup();
    render(<TimetableApp />);

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
        .find((el) => el.closest("label")?.textContent?.includes(code));
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
    expect(await screen.findByText("✓ Draft saved")).toBeTruthy();

    // Drafts step
    await user.click(screen.getByRole("button", { name: /Drafts & compare/ }));
    expect(screen.getByText(/Saved drafts \(1\)/)).toBeTruthy();
  }, 30000);
});

describe("LoginPage (demo sign-in)", () => {
  afterEach(cleanup);

  it("validates input and emits the signed-in user", async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(screen.getByText(/enter your name/i)).toBeTruthy();

    await user.type(screen.getByLabelText("Your name"), "Athul");
    await user.type(screen.getByLabelText("Email"), "athul@college.edu");
    await user.type(screen.getByLabelText("Password"), "secret1");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(onLogin).toHaveBeenCalledWith({ name: "Athul", email: "athul@college.edu" });
  });

  it("gates the wizard behind the login screen and supports sign-out", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(<Home />);

    // Login screen first (wizard hidden)
    expect(screen.getByLabelText("Your name")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3, name: /File A/ })).toBeNull();

    await user.type(screen.getByLabelText("Your name"), "Student");
    await user.type(screen.getByLabelText("Email"), "s@college.edu");
    await user.type(screen.getByLabelText("Password"), "pass");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    // Wizard appears after sign-in
    expect(
      await screen.findByRole("heading", { level: 3, name: /File A — MyCamu term slot sheet/ })
    ).toBeTruthy();
    expect(screen.getByText("Student")).toBeTruthy();

    // Sign out returns to the login screen
    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(await screen.findByLabelText("Your name")).toBeTruthy();

    window.localStorage.clear();
  });
});
