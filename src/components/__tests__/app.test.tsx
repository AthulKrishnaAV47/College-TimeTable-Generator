// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimetableApp from "@/components/TimetableApp";
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
