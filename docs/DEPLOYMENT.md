# Beta deployment and operations

## Status / launch gate

Code is configured for Vercel + Supabase Auth/Postgres + Upstash; it is **not a provisioned production deployment**. No external account, email delivery, production DB migration, Sentry ingestion or Vercel HTTPS/custom domain has been verified from this checkout. Do not invite real students until the checklist below passes. Builds/tests require no cloud credentials. The UI fails closed with a setup message when services are missing; there is no fake-login fallback.

## 1. Separate development and production

1. Create **two different Supabase projects** and two Upstash Redis databases (or entirely isolated credentials). Never point `.env.local`, CI tests or untrusted preview deployments at production. Free-tier availability and limits depend on the provider; check current quotas.
2. Copy `.env.example` to `.env.local`. Set development `SUPABASE_URL`, `SUPABASE_ANON_KEY` (anon JWT or publishable key, **never service_role**) and `APP_URL` to the exact browser origin. For Arena, this is the HTTPS preview origin, not localhost. Do not paste secrets into chat or commit them.
3. Apply the SQL files in `supabase/migrations/` in filename order (`202609260001_accounts.sql`, then `202609260002_dataset_revision_time.sql`) with the Supabase SQL editor or CLI migrations. It relies on Supabase's managed `auth.users` and `auth.sessions` schema. Run each migration once per environment; an existing installation with the accounts migration already applied only needs `202609260002_dataset_revision_time.sql`. That migration adds database-owned edit timestamps for the readiness checklist; old rows stay unknown until edited. Use new additive migrations for future changes.
4. Configure the production variables separately in Vercel's **Production** environment; Preview uses only development resources. Set `APP_URL=https://your-final-domain`. Exact origin checking deliberately rejects other preview/custom domains. Give each tested environment its own origin; do not widen to `*`.
5. Use Node 22.12+ (`npm ci`). Build uses **webpack** because Next's current Turbopack cannot trace this isolated child-process PDF worker. Keep `src/lib/server/pdf-worker.mjs` and `node_modules/unpdf` in deployment traces (already configured).

## 2. Supabase Auth (required dashboard settings)

- Enable Email/Password signup and **Confirm email**. Supabase hashes passwords and prevents duplicate accounts. Set a minimum password length of 12, and require lower/uppercase, digits and symbols in Supabase too: clients can call the public provider directly, so API validation alone is not sufficient. Enable leaked-password protection/CAPTCHA if available on your plan; provider-side auth limits are required in addition to the app's rate limits.
- Configure a real SMTP provider and sender domain (SPF/DKIM). Supabase's trial email delivery is not sufficient for public students. Test spam-folder placement.
- Site URL: exact `APP_URL`. Redirect allowlist: only the known origins/confirmation routes for that environment.
- **Customize email templates** to use token hashes, NOT URL fragments (tokens must never be stored in browser localStorage):
  - Confirm signup: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Verify email</a>`
  - Reset password: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>`
- Set email OTP/link expiry to **900 seconds**; Supabase consumes verified tokens once. A reset link opens the new-password form with an HTTP-only recovery session. Password update signs out all provider sessions afterward.
- Set access JWT expiry to at most one hour and configure session lifetimes appropriate to your institution. API/RLS checks also verify the provider session row exists and has not passed `not_after`, so **global logout revokes access immediately**, not merely at JWT expiry. Confirm this against your project's actual Supabase version (see smoke tests).
- Refresh is handled by Supabase SSR when an API validates the session; there is no browser Supabase client and no localStorage token. Cookies are HTTP-only, SameSite=Lax, path `/`, Secure in production. Standard session cookies may be chunked; check all chunks.
- Duplicate-account and reset responses intentionally do not reveal whether an email exists.
- For email scanners that pre-open single-use links, Supabase recommends a user-click interstitial/custom email landing flow. Test your college mail system; adopt that flow if links are consumed by scanning before a student opens them.

## 3. Database and moderation

`auth.users` owns identity. `student_profiles`, `workspaces`, and `timetable_drafts` are private, RLS-protected per-user records. A single transaction saves profile/workspace/drafts with a monotonically increasing revision; a single snapshot reads them. Revision conflicts stop autosave rather than overwriting another device. SQL tests execute the actual migration/RLS in PGlite, with only Supabase's auth schema emulated; they do **not** replace a hosted-provider integration test.

Term datasets contain extracted text and parsed File A/B JSON, not raw binary PDFs. Students submit **pending** datasets. Only moderators can publish/archive/correct them. Reparse runs the deterministic parsers on stored extracted text; fixing PDF extraction itself requires re-uploading the original file. Already-loaded workspaces/drafts remain snapshots when a moderator changes a dataset; students must select the term again to refresh.

Promote an existing, verified user via the SQL editor (never user-editable metadata):

```sql
insert into public.user_roles(user_id, role)
values ('REPLACE_WITH_AUTH_USER_UUID', 'admin') on conflict do nothing;
```

Refresh the app and open `/admin`. Review course codes, dates, faculty, section combinations and both eligibility years before publishing. The console provides JSON correction, text reparse, archive/publish, curated alias upsert, aggregate student/draft/dataset counts, dataset reports and account-deletion requests. It does not expose private draft contents to moderators. Infrastructure operators still have DB administrative access.

Account deletion is a **request queue**, not automatic deletion: check `/admin` daily. Delete the auth user through Supabase Auth within 30 days; FK cascades delete profile/workspace/drafts/reports/roles/request. Shared datasets remain with null uploader. Establish a monitored support channel and publish backup/log retention before launch. Never ask students to post academic history or account email in public GitHub issues.

## 4. Vercel, rate limits and monitoring

1. Import this repository into Vercel and deploy this session branch for beta review. `vercel.json` uses the Next.js preset and a 30-second PDF function budget.
2. Configure `APP_URL`, Supabase and Upstash in the correct environment **before inviting students**. Production auth/upload requests fail closed if distributed rate limiting is absent. On Vercel the app trusts only Vercel's overwritten `x-vercel-forwarded-for`; on another host, configure a trusted proxy IP mechanism before launch. Per-email auth limits are also enforced; Redis keys are hashed and expire after the limit window.
3. Vercel normally terminates HTTPS and provisions certificates. **Verify**, don't assume: HTTPS loads, HTTP redirects to HTTPS, cookies have `Secure; HttpOnly; SameSite=Lax`, and there is no mixed content. HSTS is emitted in production. No browser-facing localhost API URLs are used.
4. Optional Sentry: set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`, environment and (for source maps) org/project/auth token. The token stays in CI/Vercel secrets. Server/browser errors are allowlist-redacted before sending: no event URLs, cookies, bodies, email, academic history, breadcrumb payloads or replay recordings. Tracing/replays/advertising analytics are disabled. Trigger a controlled test exception in a staging deployment and verify it arrives with only redacted metadata/stack locations.
5. PDF limit: **3 MB**, correct `.pdf` + `application/pdf` + `%PDF-` header, max 100 pages, max 1M extracted characters. Parsing uses an isolated child process, a 256 MB V8 heap cap and a 20-second kill timeout. A Node heap cap is not a total OS memory guarantee: retain hosting memory/concurrency limits and WAF protection. Vercel's outer request-size ceiling also applies. Text/CSV imports remain supported with bounded UTF-8 input.
6. Enable provider/WAF abuse controls and billing alerts. Monitor auth failures, upload errors, deletion requests and DB/Redis quotas. Take backups according to your plan and test restoration.

## 5. Required staging acceptance tests (two separate browsers/accounts)

- Signup with malformed email/weak password fails. Valid signup sends a verification email; unverified login is blocked by provider configuration. Duplicate signup does not create a second account or expose existence.
- Verify once; reusing/expired verification/reset links fails safely. Forgot-password email arrives, password changes, old password stops working, new password works.
- Refresh and reopen browser: session survives. Sign out: refresh shows login, previously captured cookie/API request is denied immediately, and other devices are also signed out. Wait past access-token expiry: normal session refresh works.
- Alice saves a profile/draft. Bob sees none of Alice's data and cannot read/update by guessing IDs or changing request `user_id`/owner headers. Verify anon access and non-admin moderation requests fail.
- Saving from another tab yields a visible conflict; export unsaved work before reload. Simulate network failure: status says **Not saved**, not success. Legacy import is explicit, owner-confirmed and does not silently attach shared-browser data; old keys are removed only after a successful save.
- EMPD resolves to `19AI303` and appears in diagnostics as completed, never eligible/auto-selected/replacement. Unknown or ambiguous entries show warnings and block proceeding until corrected; they are not silently discarded. Check your actual college aliases.
- Upload valid PDFs on the **deployed** function to confirm child-process tracing; reject oversized files, wrong MIME/signature and malformed PDFs with a clean error. Test scanned PDFs and text fallback.
- Submit, moderate, select and flag a shared term; non-admin cannot publish or edit aliases. Test a correction/reparse and explicitly reload the dataset into a workspace.
- Pin conflicting subjects and confirm neither is removed on retry. Lock an alternative section and a mandatory package; no-class fallback must retain the lock. Confirm a completed pinned course is blocked with an explicit unpin/unlock option. Refresh the account and verify pins/locks persist.
- Check the enrollment-readiness panel against actual subject/credit counts, SBC/FC minimums, dropped initial auto-picks, selected option rule violations and section dates. PNG/ICS require warning acknowledgement, which resets when switching options; missing required courses and invalid dates cannot be acknowledged away. Unknown/local dataset update times must not be presented as fresh.
- Export PNG/ICS and check term dates; mobile agenda and Sunday classes render. Check solver fallback warnings when hard no-class rules cannot be honored.
- Confirm Sentry delivery, privacy copy, support channel, deletion workflow, HTTPS and backups. Invite a small beta cohort, not the whole college immediately.

## Intentionally deferred

Public friend-sharing URLs, popularity analytics, registration reminder emails/deadline management, alias-suggestion moderation queue, and aggregated blocking-pair telemetry are not implemented. Admin aggregates currently count students, saved drafts, datasets and reports, not every generation attempt. No public-read policies exist for private drafts. These features need separate consent, abuse/retention design and operational configuration.
