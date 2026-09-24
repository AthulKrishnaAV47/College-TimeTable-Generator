<div align="center">
  <h1>🎓 College Term Timetable Generator</h1>
  <p><i>Turn a MyCamu ERP term slot sheet into a valid, conflict-free weekly timetable for a single term.</i></p>
  <p>
    <img src="https://img.shields.io/badge/Next.js-16-black?style=flat&logo=next.js" alt="Next.js" />
    <img src="https://img.shields.io/badge/React-19-blue?style=flat&logo=react" alt="React" />
    <img src="https://img.shields.io/badge/TailwindCSS-4-38B2AC?style=flat&logo=tailwind-css" alt="Tailwind" />
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript" alt="TypeScript" />
  </p>
</div>

---

The college runs on a term system (1 semester = 2 terms of ~3 months). Each term a student enrolls in a subset of subjects classified as **SBC** (Skill Based Course) or **FC** (Foundation Course) that are valid for their year. Because a student must attend **100% of weekly contact hours** of every section they're placed in, no two chosen sections may overlap in day+time — this app finds such assignments automatically.

## ✨ Features

- 📄 **Smart PDF Parsing:** Parses the real MyCamu "course overview" PDF export (File A) and the SBC/FC eligibility table (File B). PDF extraction runs server-side via `pdf.js` with layout-aware column parsing.
- 🎯 **Eligibility Engine:** Automatically intersects courses offered this term with your year's eligibility. Year II & III students automatically gain access to Year I subjects. 
- 🤖 **Auto-selection Mode:** Finds a schedulable subject subset honoring target counts, credit totals, and category minimums (with visible retry logs and backtracking).
- 🧩 **Smart Section Handling:** Supports both *alternatives (pick 1)* and *mandatory combos (take all)* (e.g., Lecture + Practical pairs). Pre-selects suggestions while allowing manual overrides.
- ⚡ **Conflict-free Scheduling Engine:** Uses a backtracking search with the **MRV (minimum remaining values)** heuristic at 1-hour cell granularity. Zero-overlap guarantee with ranked solutions based on fewest gaps, free days, earliest finish, or preferred faculty.
- 🛑 **No-Class Rules:** Add custom constraints like *no Saturday classes* or *no 08:00–10:00 classes*. The solver strictly respects these constraints and falls back gracefully to the *closest* valid schedule if no perfect match exists.
- 🔍 **Actionable Diagnostics:** Instead of a generic failure, get exact **mutually blocking course pairs** (e.g., "19CS305 and 19AI410 have no non-overlapping section pair").
- 📅 **Rich Exports:** Generates a visually beautiful weekly grid. Export as a **PNG image** or an **.ics calendar file** for Google/Apple Calendar.
- 💾 **Drafts & Sessions:** Save multiple timetable drafts in `localStorage` to compare side-by-side. 

---

## 🚀 Getting Started

Ensure you have Node.js installed.

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
# The app will be running at http://localhost:3000

# 3. Run the test suite (parser, solver, ICS, UI)
npm test

# 4. Build for production
npm run build
```

### ⏱️ Try it in 30 seconds

1. Open the app and go to **Step 1**. 
2. Click **Load sample data** on both panels (this populates a real-format sample slot sheet and eligibility table, covering all edge cases).
3. Proceed and keep **Year I – Term 2**, then continue.
4. Tick a few subjects (or just click **Auto**) and continue.
5. Review alternative/combo toggles, then click **Find conflict-free timetables**.
6. Pick your favorite option, export it, save as a draft, and compare!

---

## 🏗️ Architecture

```text
src/
├── lib/
│   ├── types.ts               # Domain model (Course, Section, Placement, Solution, Draft…)
│   ├── time.ts                # Time utilities (cell merging, placeholder detection)
│   ├── parse/slotSheet.ts     # File A parser (pure, line-based regexes)
│   ├── parse/eligibility.ts   # File B parser (pure)
│   ├── solver.ts              # Backtracking engine (MRV, ranking, auto-select)
│   ├── grid.ts                # Grid model and UI hour-range derivation
│   ├── svg.ts                 # Deterministic SVG renderer for PNG export
│   └── ics.ts                 # RFC 5545 calendar generator
├── app/
│   ├── api/parse/route.ts     # Server-side PDF extraction (unpdf/pdf.js)
│   └── page.tsx               # The main wizard UI
└── components/                # Step components, grid UI, and state machine
```

### 🧠 Scheduling Engine Deep Dive

Each enrolled course becomes a list of **candidate placements**. The solver:
1. Orders courses by **fewest consistent placements first (MRV)**, failing fast to prune the search tree.
2. Backtracks over placements using an interval-collision busy list at 1-hour granularity.
3. Collects up to 50 distinct solutions, deduplicates them, and ranks them by user preference.
4. Applies **no-class rules** directly into the search tree as hard guarantees.
5. Computes **blocking pairs** on failure to provide clear error messages to the user.

---

## 🛡️ Edge Cases Handled

| Edge Case | How We Handle It |
| :--- | :--- |
| **Open Electives** | E.g. Japanese/Yoga: Handled as one trivial alternative. |
| **1-min Placeholders** | Flagged as `self-paced`, excluded from conflicts and grid, shown as a note. |
| **Two-faculty sections** | Safely parsed as an array, displayed joined, fully preference-aware. |
| **Total Conflicts** | Reports precise blocking-pair errors with hints for relaxation. |
| **Cross-Year Subjects** | Year I rows included automatically for senior students. |

---

## 🛠️ Troubleshooting: Two-Column Slot Sheets

The MyCamu export is often **multi-column**. Naive PDF extraction concatenates items visually, inventing class hours that create fake conflicts. We fix this via:

1. **Layout-aware Extraction:** PDF items are rebuilt column-by-column from their `x/y` coordinates.
2. **Artifact Armor:** Exact duplicate time cells within a section are purged.
3. **Near-miss Diagnostics:** If no valid timetable exists, the app lists the *closest schedules* indicating exactly which hours are clashing.

---

## 📝 Notes & Limitations

- **Local First:** Session state, completed history, and drafts persist in `localStorage` only. No backend database required.
- **Timezones:** ICS exports use floating local times (`DTSTART:20260123T150000`), letting your calendar app map it correctly.
- **Grid Days:** The UI grid defaults to Mon–Sat, but Sunday cells are fully parsed and conflict-checked if present.
