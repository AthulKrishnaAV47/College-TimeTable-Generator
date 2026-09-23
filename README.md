# College Term Timetable Generator

Turn a **MyCamu ERP term slot sheet** into a **valid, conflict-free weekly timetable** for a single term.

The college runs on a term system (1 semester = 2 terms of ~3 months). Each term a student enrolls in a subset of subjects classified as **SBC** (Skill Based Course) or **FC** (Foundation Course) that are valid for their year. Because a student must attend **100% of weekly contact hours** of every section they're placed in, no two chosen sections may overlap in day+time — this app finds such assignments automatically.

## Features

- **Parses the real MyCamu "course overview" PDF export** (File A) and the **SBC/FC eligibility table** (File B) — upload the PDF (parsed server-side via pdf.js) or paste extracted text.
- **Eligibility engine**: `File A courses offered this term ∩ File B rows matching your year − completed courses`, grouped by SBC/FC with configurable per-category targets. **Year II & III students also get every Year I subject** (own-year rows win for SBC/FC classification when a code has both).
- **Two selection modes**: manual checklist, or **auto-selection** that finds a schedulable subject subset honoring target count / credit total / SBC+FC minimums (retries by swapping the most-constrained subject, with a visible retry log).
- **Per-course section modes (§ combo nuance)**: for each subject, sections are either *alternatives — pick 1* or a *mandatory combo — take all* (e.g. Lecture+Practical pairs). A heuristic (2 sections sharing the same faculty → combo) pre-selects a suggestion that you can always override.
- **Conflict-free scheduling**: backtracking search with the **MRV (minimum remaining values)** heuristic at **1-hour cell granularity**, zero-overlap guarantee, ranked solution list (fewest gaps / most free days / earliest finish / preferred faculty).
- **No-class rules**: hard constraints like *no Saturday classes*, *no 08:00–10:00 classes* or *no 15:00–17:00 classes* (any custom window works — partial overlaps count). The solver only picks rule-respecting sections; a course with no rule-respecting section is named in the diagnostics, and auto-selection drops/swaps such courses first.
- **Actionable failures**: when no timetable exists, it names the exact **mutually blocking course pairs** ("19CS305 and 19AI410 have no non-overlapping section pair") and impossible courses, instead of a generic error.
- **Weekly grid output**: Mon–Sat columns, hour rows **derived from the parsed data** (not hardcoded 08–17), color-coded course blocks, contact-hours/credits side panel.
- **Exports**: PNG image (SVG-rasterized) and **.ics calendar** with weekly recurring events between each section's start/end dates (importable into Google/Apple Calendar).
- **Drafts**: save multiple timetable drafts in `localStorage` and compare them side by side.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest: parser, solver, ICS + full-wizard UI tests
npm run build      # production build
```

### Try it in 30 seconds

1. Open the app → step 1 → click **Load sample data** on both panels (real-format sample slot sheet + eligibility table, including all the irregular cases below).
2. Continue → keep *Year I – Term 2* → continue.
3. Tick a few subjects (or use **Auto**) → continue.
4. Check the alternative/combo toggles → **Find conflict-free timetables**.
5. Pick a ranked option, export PNG/.ics, save drafts, compare them in step 6.

## Input formats (encoded from real exports)

### File A — MyCamu term slot sheet

```text
19AI305 [3 Credits]                          ← course header (code may be non-standard, e.g. "QNX RTOS")
ENGINEERING SCIENCES - ENGINEERING SCIENCES  ← category (free text)
Course overview                              ← fixed marker, skipped
Advanced C Programming                       ← course name
UG - 04, T1-P3, AI - Trainer 10 .            ← batch, slot code, dept - faculty (may list 2 faculty)
Date: 21-01-2026 to 28-03-2026
Friday: 15:00 - 16:0016:00 - 17:00           ← contiguous 1-hour cells concatenated w/o separator
Monday: 08:00 - 09:0009:00 - 10:00
...                                          ← repeats per section until the next header
```

Parser tolerances (all covered by tests): concatenated hour blocks, two-faculty sections (`"MAHENDRAN K , Baraneedharan .P"`), non-standard codes (`QNX RTOS`), single-day date ranges, 1-minute administrative placeholders (`Wednesday: 17:04 - 17:05` → flagged **self-paced**, never block conflicts or appear on the grid), and the same course code in multiple (non-adjacent) blocks → merged into one course entry.

### File B — SBC/FC eligibility table

```text
Course Code | SBC or FC | Year
19AI301     | SBC       | I
19CS305     | FC        | I
19CS305     | FC        | II & III   ← same code at two year levels: duplicates preserved
```

Pipe/tab/multi-space/comma separated layouts and plain text rows all parse. File B encodes **no term info** — the term filter is exactly "appears in File A".

## Architecture

```
src/
  lib/
    types.ts               domain model (Course, Section, Placement, Solution, Draft…)
    time.ts                HH:MM ↔ minutes, cell merging, placeholder detection, date math
    parse/slotSheet.ts     File A parser (pure, line-based regexes)
    parse/eligibility.ts   File B parser (pure)
    eligibility.ts         File A ∩ File B − completed  (§3.2)
    solver.ts              placements, MRV backtracking, ranking, diagnostics, auto-select
    grid.ts                grid model, color palette, hour-range derivation
    svg.ts                 deterministic SVG renderer (used for PNG export)
    ics.ts                 RFC 5545 calendar generator (recurring weekly VEVENTs)
    download.ts            browser exports (PNG rasterize, file download)
    store.ts               localStorage session + drafts
    sample.ts              real-format sample data (all irregular cases)
  app/
    api/parse/route.ts     server-side PDF text extraction (unpdf/pdf.js) → parsers
    page.tsx               the wizard
  components/              TimetableApp (state machine) + step components + grid
```

### Scheduling engine

Each enrolled course becomes a list of **candidate placements** (one per section in *alternatives* mode; exactly one in *mandatory-combo* mode — itself impossible if its own sections overlap). The solver:

1. Orders courses by **fewest consistent placements first (MRV)** at each decision point, so the most-constrained course fails fast and prunes the tree.
2. Backtracks over placements, maintaining an interval-collision busy list at 1-hour granularity (placeholder cells excluded).
3. Collects up to 50 distinct solutions under a node budget, dedupes them, ranks by the chosen preference (gaps / free days / earliest finish / faculty), and shows the top options.
4. Filters every placement through the **no-class rules** (excluded days / time windows) before searching, so constraints are hard guarantees, not post-filters.
5. On failure, computes **blocking pairs** (course A × B with no compatible placement pair) and **impossible courses** — including courses whose sections were all eliminated by the no-class rules — for the error UI.

The engine is dependency-free by design (trivial at ~10 courses × ~10 sections); its input/output types are solver-agnostic, so an ILP/SAT backend could be swapped in behind `solve()` if term sizes grow. Auto-selection (§3.3) wraps `solve()`: highest-value subset first, then iterative repair — drop/swap the subject with the fewest section options — within a retry budget.

## Edge cases explicitly covered (§7)

| Case | Behavior |
| --- | --- |
| Single-section open elective (Japanese/Yoga) | one trivial alternative, never blocks alone |
| 1-minute placeholder sections (Env. Sciences, Human Values) | flagged `self-paced`, excluded from conflicts/grid/ICS, shown as a note |
| Duplicate File B rows across year levels | preserved; matched per the student's year |
| Two-faculty sections | `faculty[]` array, joined for display, preference-aware |
| Non-standard code `QNX RTOS` | parsed as-is + warning |
| Every section of A conflicts with every section of B | named blocking-pair error with relaxation hints |
| No-class rules (e.g. no Saturday / no 3–5 PM) | hard solver constraints; fully blocked courses reported with a distinct reason |
| Year II & III enrolling in Year I subjects | Year I rows included automatically; own-year SBC/FC classification wins on conflicts |

## Testing

```bash
npm test
```

55 tests: parser fixtures built from the exact sample text (§2), eligibility intersection (including the Year II & III ⊇ Year I expansion), solver properties (zero-overlap guarantee, combo handling, ranking, faculty preference, no-class day/time constraints, near-miss diagnostics, auto-select fallback), column-aware PDF reconstruction (two-column bleed reproduction: parse + solve end-to-end), a real-world garbled-sheet regression fixture, ICS format, and a full-wizard UI smoke test (sample data → profile → manual pick → section modes + a no-Saturday rule → solve → draft).

## Troubleshooting: two-column slot sheets

The MyCamu export is **multi-column** — several course blocks sit side-by-side on one page. Naive PDF text extraction concatenates items in visual-line order, so a neighbouring block's fragments get glued onto a section's day lines (e.g. a Cloud Computing section showing *Monday 10:00–17:00*: its own 10:00–12:00 class plus the two sections printed next to it), inventing class hours that create fake conflicts — the solver then reports "no valid timetable" even though one exists.

The app defends in three layers:

1. **Layout-aware extraction** (default): PDF text items are rebuilt column-by-column from their x/y coordinates before parsing. The parse response reports `extraction: "layout-aware"`; text pasted manually skips this, so paste from a tool that respects columns.
2. **Artifact armor**: exact duplicate time cells within a section are removed with an explicit parser warning (a section cannot meet the same hour twice).
3. **Near-miss diagnostics**: when no timetable exists, the failure screen lists the *closest schedules* — complete assignments with the fewest overlapping hours and the exact clashing blocks named ("19AI541 T1-P14 × 19CS405 T1-Q19: Saturday 15:00–17:00") — so a garbled section is obvious at a glance and genuinely full schedules are actionable.

## Notes & limits

- Everything runs locally: parsing via one Node API route (needed for PDFs), all solving in the browser. Session state, completed history and drafts persist in `localStorage` only.
- ICS events use floating local times (`DTSTART:20260123T150000`), which Google/Apple Calendar interpret in the calendar's timezone.
- The grid shows Mon–Sat (Sunday never appears in the sample data); Sunday cells would still be parsed, counted, and conflict-checked.
