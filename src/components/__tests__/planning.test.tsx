// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimetableApp from "../TimetableApp";
import ScheduleStep from "../steps/ScheduleStep";
import { DEFAULT_STATE } from "@/lib/appState";
import { solve } from "@/lib/solver";
import type { EligibleSubject, Section } from "@/lib/types";
import { downloadText } from "@/lib/download";
vi.mock("@/lib/download", () => ({
  downloadText: vi.fn(),
  downloadBlob: vi.fn(),
  svgToPngBlob: vi.fn(),
  slugify: (s: string) => s,
}));
const section = (
  slotCode: string,
  day: "Monday" | "Tuesday" | "Wednesday",
): Section => ({
  slotCode,
  batch: "A",
  department: "AI",
  faculty: ["Teacher"],
  startDate: "2027-01-01",
  endDate: "2027-04-01",
  weeklyCells: [{ day, startTime: "09:00", endTime: "10:00" }],
  weeklyHours: 1,
  selfPaced: false,
});
const a: EligibleSubject = {
  courseCode: "A",
  courseName: "Algorithms",
  credits: 4,
  type: "FC",
  category: "",
  sectionMode: "alternative",
  sections: [section("T1", "Monday"), section("T2", "Tuesday")],
};
const b: EligibleSubject = {
  ...a,
  courseCode: "B",
  courseName: "Databases",
  sections: [section("T3", "Wednesday")],
};
const student = {
  id: "student",
  name: "Student",
  email: "s@example.com",
  verified: true,
  admin: false,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("pinned course and section-lock workflow", () => {
  it("keeps other auto-selected courses when pinning/locking and exposes ineligible requirements", async () => {
    const state = {
      ...DEFAULT_STATE,
      step: 2,
      mode: "auto",
      slotSheet: { text: "", courses: [a, b], warnings: [] },
      eligibility: {
        text: "",
        rows: [a, b].map((c) => ({
          courseCode: c.courseCode,
          type: "FC",
          year: "I",
        })),
        warnings: [],
      },
      autoChosen: ["A", "B"],
      autoInitialCourseCodes: ["A", "B"],
      autoSettings: {
        ...DEFAULT_STATE.autoSettings,
        targetCount: 2,
        minFC: 1,
        minSBC: 0,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string, options?: RequestInit) =>
          new Response(
            JSON.stringify(
              url === "/api/aliases"
                ? { aliases: [] }
                : options?.method === "PUT"
                  ? { revision: 1 }
                  : { state, drafts: [], revision: 0 },
            ),
          ),
      ),
    );
    const user = userEvent.setup();
    render(<TimetableApp user={student} />);
    await user.click(
      await screen.findByRole("checkbox", { name: "Must include A" }),
    );
    await user.click(
      screen.getByRole("button", { name: /Confirm 2 subjects/ }),
    );
    await user.selectOptions(
      screen.getByLabelText("Lock section for A"),
      "A::T1",
    );
    expect(screen.getByLabelText("Lock section for B")).toBeTruthy(); // locking A must not erase B
    await user.click(
      screen.getByRole("button", { name: /Find conflict-free timetables/ }),
    );
    const checklist = await screen.findByRole("region", {
      name: "Enrollment-readiness checklist",
    });
    expect(
      within(checklist).getByText(
        "All pinned courses and section locks are honored.",
      ),
    ).toBeTruthy();
    const exportButton = screen.getByRole("button", {
      name: ".ics calendar",
    }) as HTMLButtonElement;
    expect(exportButton.disabled).toBe(true);
    await user.click(
      screen.getByRole("checkbox", { name: /I have reviewed these warnings/ }),
    );
    expect(exportButton.disabled).toBe(false);
    await user.click(exportButton);
    expect(downloadText).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: /Your profile/ }));
    await user.type(screen.getByLabelText("Completed courses"), "A");
    await user.click(
      screen.getByRole("button", { name: /See eligible subjects/ }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Required courses are not eligible",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Resolve unavailable required courses",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Unpin A" }));
    expect(screen.getByRole("button", { name: "Unlock A" })).toBeTruthy(); // unpin alone never unlocks a section
    await user.click(screen.getByRole("button", { name: "Unlock A" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: "Must include A" }),
    ).toBeNull();
  });
});

describe("export review acknowledgement", () => {
  it("requires review again when changing timetable options or planning targets", async () => {
    const result = solve([a], {});
    if (!result.ok) throw new Error("fixture must solve");
    const props = {
      profile: DEFAULT_STATE.profile,
      enrolledCourses: [a],
      rankBy: DEFAULT_STATE.rankBy,
      onRankBy: vi.fn(),
      solutions: result.solutions,
      truncated: false,
      solutionIdx: 0,
      onSolutionIdx: vi.fn(),
      failure: null,
      solveOutcome: "strict" as const,
      nearMiss: null,
      constraints: DEFAULT_STATE.constraints,
      onSaveDraft: vi.fn(),
      onBack: vi.fn(),
      onReenroll: vi.fn(),
      allCourses: [a],
      onReplaceCourse: vi.fn(),
      protectedCodes: [],
      readinessInput: {
        eligible: [a],
        targets: DEFAULT_STATE.autoSettings,
        pinnedCourseCodes: [],
        prefs: {},
        constraints: DEFAULT_STATE.constraints,
        initialAutoCodes: [],
        datasetSource: null,
      },
    };
    const user = userEvent.setup();
    const { rerender } = render(<ScheduleStep {...props} />);
    const ack = () =>
      screen.getByRole("checkbox", { name: /I have reviewed these warnings/ });
    const button = () =>
      screen.getByRole("button", {
        name: ".ics calendar",
      }) as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    await user.click(ack());
    expect(button().disabled).toBe(false);
    rerender(<ScheduleStep {...props} solutionIdx={1} />);
    expect(button().disabled).toBe(true);
    await user.click(ack());
    expect(button().disabled).toBe(false);
    rerender(
      <ScheduleStep
        {...props}
        solutionIdx={1}
        readinessInput={{
          ...props.readinessInput,
          targets: { ...DEFAULT_STATE.autoSettings, targetCount: 6 },
        }}
      />,
    );
    expect(button().disabled).toBe(true);
  });
  it("does not allow acknowledgement to bypass a missing pinned course", () => {
    const result = solve([a], {});
    if (!result.ok) throw new Error("fixture");
    render(
      <ScheduleStep
        profile={DEFAULT_STATE.profile}
        enrolledCourses={[a]}
        rankBy={DEFAULT_STATE.rankBy}
        onRankBy={() => {}}
        solutions={result.solutions}
        truncated={false}
        solutionIdx={0}
        onSolutionIdx={() => {}}
        failure={null}
        solveOutcome="strict"
        nearMiss={null}
        constraints={DEFAULT_STATE.constraints}
        onSaveDraft={() => {}}
        onBack={() => {}}
        onReenroll={() => {}}
        allCourses={[a, b]}
        onReplaceCourse={() => {}}
        protectedCodes={["B"]}
        readinessInput={{
          eligible: [a, b],
          targets: DEFAULT_STATE.autoSettings,
          pinnedCourseCodes: ["B"],
          prefs: {},
          constraints: DEFAULT_STATE.constraints,
          initialAutoCodes: [],
          datasetSource: null,
        }}
      />,
    );
    expect(
      screen.getByText("Resolve blocking checks before exporting."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("checkbox", { name: /I have reviewed/ }),
    ).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: ".ics calendar",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
