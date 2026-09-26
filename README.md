# MyCamu Term Timetable Generator · Beta

Next.js / React / TypeScript / Tailwind scheduler for a single college term. Parse MyCamu File A (slot sheet) and File B (SBC/FC eligibility), exclude completed courses, and find compatible sections. Independent student project, not officially affiliated with any college or MyCamu.

## What is implemented

- **Canonical course resolution:** codes, names, significant-word initials and curated aliases (including `EMPD → 19AI303`). Ambiguous/unknown completions are visibly flagged, never guessed. Search + a checkbox picker avoids relying on abbreviations alone.
- **One eligibility engine:** File A ∩ matching File B year rows − completed courses. Senior students inherit Year I rows. Manual selection, auto-select, retries and local replacement suggestions all use this pool. Runtime guards and a diagnostics panel expose solver inputs; changing completion/profile/data invalidates stale results.
- **Real accounts:** Supabase Auth signup/login/verification/reset/logout, server-side validation, HTTP-only secure production cookies, provider-session revocation checks and distributed auth rate limits. No demo identity or localStorage tokens.
- **Private cloud persistence:** Supabase Postgres + row-level security; atomic profile/workspace/draft save, cross-device conflict detection, visible save failures and explicit legacy browser import. PNG/ICS and JSON portability are retained.
- **Shared terms:** moderated File A/B datasets, term picker, stale-data reporting, `/admin` JSON correction/reparse/publish/archive, aliases, aggregate counts and account-deletion queue.
- **Must-include courses and section locks:** pin required subjects; lock a particular section or mandatory package. Auto retries and replacement suggestions cannot remove them. Changed/missing locked sections require explicit review; completion/year exclusions still win.
- **Enrollment-readiness checklist:** compare subject/credit targets and SBC/FC minimums, inspect dropped auto-picks, rule violations, section dates and dataset source timestamps before exporting. Warnings require acknowledgement for each displayed plan; missing pins/locks or invalid dates block exports. Pins, locks and the initial auto-selection survive account reloads.
- **Solver:** alternatives vs mandatory-combo sections, MRV backtracking, no-class day/time rules, ranked schedules, blocking pairs, near misses and retry logs. Rule relaxation is visibly labeled, not silently presented as a strict solution.
- **Upload safety:** bounded files/text, PDF extension/MIME/signature checks, isolated parser process with resource/time limits and clean error handling.
- **Responsive timetable:** desktop weekly grid, mobile daily agenda, Sunday when present, PNG and floating-local-time ICS exports.
- **Operations:** Vercel config, environment template, optional redacted Sentry errors, privacy page, CI and deployment checklist.

## Run locally

Node **22.12+** required.

```sh
npm ci
cp .env.example .env.local
# Configure a DEVELOPMENT Supabase project and apply the SQL migration.
# See docs/DEPLOYMENT.md for required auth/email settings.
npm run dev
```

Open the app, create and verify an account, then sign in. Choose an approved shared term or load sample data in both upload panels, complete your profile, select subjects, confirm sections and generate a timetable. Without configured services the app displays a setup error; it never falls back to fake authentication.

```sh
npm run typecheck
npm test
npm run build
npm start
```

Build uses webpack for reliable child-process PDF-worker tracing. Development/start bind to `0.0.0.0`. In hosted previews, set `APP_URL` to the exact browser origin. All browser API calls are same-origin relative paths.

## Using the new planning safeguards

1. In **Subjects**, set **Must-include courses** and your **Planning targets** (available in manual and auto modes).
2. In **Sections**, choose **Lock section for …** to keep one exact section/package. A lock also makes the course required; unlock it before changing section mode or removing that course.
3. If pinned subjects conflict, the app reports the blocking pair rather than dropping a required course. If a pin becomes completed/ineligible, remove its pin/lock explicitly from Subjects; eligibility is never overridden.
4. In **Timetable**, read the **Enrollment-readiness checklist**. A conflict-free plan can still miss your targets. Review warnings and acknowledge them to enable PNG/ICS export; saving a draft remains available. Choosing another option resets acknowledgement.
5. Dataset update timestamps are the **last known snapshot at load**, not a live freshness guarantee. For existing databases, apply `supabase/migrations/202609260002_dataset_revision_time.sql`. Existing dataset update times remain unknown until their next edit rather than inventing a backfilled timestamp.

## Deploy safely

**Start with [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).** It covers Supabase migrations/RLS, verification/reset email templates, SMTP, separate production resources, Upstash, Vercel HTTPS/cookies, Sentry, moderation, deletion operations and two-account staging checks.

The repository contains deployment-ready configuration, **not provisioned cloud services or a verified live production release**. Never commit credentials. Never use a service-role key in this application. Production auth endpoints require distributed rate limiting.

## Architecture

| Path | Responsibility |
| --- | --- |
| `src/lib/courseCodes.ts`, `eligibility.ts` | Canonical resolution and shared eligibility |
| `src/lib/solver.ts` | Placement search, no-class fallback, eligible-only auto retries |
| `src/components/TimetableApp.tsx` | Wizard, diagnostics, cloud sync and imports |
| `src/lib/store.ts`, `validation.ts` | Serialized optimistic saves and runtime validation |
| `src/app/api/auth`, `auth/confirm` | Server-only Supabase session lifecycle |
| `src/app/api/workspace`, `datasets`, `aliases`, `admin` | Authenticated, owner-/role-scoped APIs |
| `supabase/migrations` | Tables, RLS, atomic RPCs, role/session checks |
| `src/app/api/parse`, `src/lib/server/pdf*` | Bounded uploads and isolated PDF extraction |
| `src/lib/parse`, `pdfLayout.ts` | Deterministic parsers and column-aware reconstruction |
| `src/lib/grid.ts`, `svg.ts`, `ics.ts` | Calendar rendering and portable exports |
| `src/lib/__tests__`, `src/components/__tests__` | Parser/solver/UI, auth, persistence, PDF and PostgreSQL policy regressions |

## Limitations and launch scope

- Verify eligibility and section dates against official registration information; this app does not enroll students.
- Auto-selection is budgeted heuristic search and can return fewer courses after dropping a conflicting **unpinned, unlocked** subject; review the chosen counts/credits. It is not a proof that no better subset exists.
- Unknown completed-history entries must be resolved/corrected against the loaded course index before continuing; no fuzzy guessing.
- Drafts are snapshots; changing a shared dataset does not silently rewrite a student's plan. Select the term again to update it.
- ICS uses floating local times. Self-paced administrative placeholders do not consume calendar slots.
- Account deletion is an operator-processed request (30-day commitment); configure a monitored support channel before launch.
- Friend-sharing, popularity analytics, registration reminders and aggregate blocking-pair telemetry remain deferred. See deployment guide for scope and launch gates.
