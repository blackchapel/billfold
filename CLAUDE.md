# Billfold – working memory for Claude

Read this first. Keep it accurate: update it in the same commit as any change that affects it, and whenever the owner
gives a new "always do this" instruction (add it under **Standing instructions** the same session).

## Standing instructions from the owner
1. **Branches.** `main` = production, `develop` = integration (deployed to Vercel for the owner's testing),
   `feature/*` or `claude/*` = work branches. **Always cut feature branches from `develop`** (never from `main`).
   Flow: feature (tested locally) → `develop` (owner tests on Vercel) → `main`.
2. **Merging.** (Updated Nov 2026) Claude **does not merge anything**: it opens a PR into `develop` and the owner (blackchapel) reviews and merges it.
   Claude must **never** merge into `main` or push to it, and never force-push `main`/`develop`. Only the owner merges `develop` → `main`;
   Claude may open that PR when asked.
3. **Enforcement.** Workflow `.github/workflows/enforce-main-source.yml` fails any PR to `main` not from `develop`
   (check name `Only develop can merge into main`). The owner sets GitHub branch protection/ruleset on `main` by hand
   (the API is blocked for Claude): require PR + that check, block force-push/deletion.
4. UI verification: every phase that adds or changes pages ships `verify:ui` flows (`docs/qa/flows.md`) and Claude runs `pnpm verify:ui` before opening the PR
   (the owner asked for no gaps). Never email real recipients, touch real Drive, or use real bills/passwords in tests.
5. Never commit secrets, real bill files, passwords or personal data. Fixtures are generated.
6. Explain things to the owner in simple language; list what they must do manually (env vars, Google, Vercel, Supabase).
7. **Finish phases completely.** Do not leave gaps for the owner to discover and ask about: build every part of the phase and of earlier phases' known gaps, with tests
   (unit, integration, `verify:ui` flows) and docs (CLAUDE.md, setup guide, ADR, QA flows) in the same PR. If something truly cannot be done or verified in the sandbox,
   say exactly what and why in the PR, and what the owner must do. Never end with a list of things "left".

## Product
Billfold: private, multi-tenant (org) web app for families/small teams (<100 people) to collect recurring bills from Gmail,
remove PDF passwords, extract amounts with Gemini, file PDFs in Google Drive, review in a dashboard and email a summary
with PDFs attached. Manual runs/sends only. Zero-cost (free tiers). Non-goals: share links, built-in source templates,
approval workflows, non-Gmail ingestion (design interfaces for it), scheduled runs (only two daily crons: Supabase keep-alive and the connection health check).

## Fixed decisions (details in docs/decisions/)
Next.js App Router + TS strict + Tailwind v4 on Vercel; Supabase Auth (Google only) + Postgres via Drizzle (server-side only);
Drive is the only file store (IDs/hashes in DB); Gemini with mock extractor until key exists; per-org envelope encryption;
INR only but schema supports many currencies; roles Owner/Admin/Member/Viewer + per-member overrides; login allowlist in DB
(`platform_allowlist`) managed by super admins from `SUPER_ADMIN_EMAILS`; Google project A (login, plus Drive through the restricted `drive` scope; verification is the owner's) and
project B (unverified: gmail.readonly + gmail.send); app passwords (IMAP/SMTP) also supported for mail; every run config must
choose a Drive connection; processing is chunked one item per request.

## Architecture rules
Layers (imports point inward; **lint enforces it**, see `eslint.config.mjs`):
`domain` ← `server/application` ← `server/http` ← `app/components/hooks`; `server/infra` implements domain ports;
`server/composition-root` is the only place that wires infra to ports (and exposes `authGateway`, `container()`).
- `domain/`: value objects (Money, Currency, Period), policies (permissions), ports (interfaces), typed `DomainError`, `Result`. No framework/SDK imports.
- `server/application/`: small single-purpose use cases; depend on ports only.
- `server/http/`: thin controllers (server actions in `actions/`, read models in `queries/`, `session.ts`). Authenticate → authorise → Zod-validate → one use case → map to DTO/friendly message (`runAction`).
- `server/infra/`: Drizzle schema/migrations/repositories, crypto, config (`env()`), Supabase auth helpers.
- `components/` presentational; logic in `hooks/`; components never call server code. `types/`, `constants/` hold only types/constants. `lib/` is framework-agnostic helpers.
- Only repositories touch the DB; every org-owned repository method takes `orgId`. Authorisation goes through `AuthorizationService` (non-members get `not_found`, not `forbidden`).
- No `any`; no non-null assertions without a comment; split files past ~250 lines. No pattern for its own sake.

## Conventions
- Money: `Money` (bigint minor units), never floats; format only via `lib/format-money.ts`.
- Errors: expected → `DomainError`/`Result`; unexpected → throw. Messages shown to users come from `USER_MESSAGES` (validation passes its own text).
- Redaction: `lib/redact.ts`; audit metadata is redacted in the repository. Secrets never reach client, logs or Gemini.
- New table: add schema file, `pnpm db:generate`, ensure RLS is enabled (test fails otherwise), add repository + port.
- New use case: class in `server/application`, wire in `composition-root/container.ts`, expose via an action/query, add unit test with `tests/fakes/memory.ts`.
- New page: server component in `src/app/(app)/[orgSlug]/...` calling `requireOrg(slug)` and a `queries/` function; hide actions the user lacks, but the server is the source of truth.
- New provider (later phases): port in `domain/ports`, adapter in `infra/providers`, selected by `ProviderFactory`.
- Reserved org slugs live in `constants/app.ts` (`RESERVED_SLUGS`); add to it when adding a top-level route.
- Commits: small, one concern each.

## Design rules (docs/design.md)
Editorial "statement" look: paper background, ink text, one green accent, hairline 1px borders, 2–6px radii, Newsreader serif headings,
Inter UI, tabular right-aligned money, real dark palette, mobile-first, WCAG AA. Never: gradients, glass, glows, emoji icons,
default shadcn look, identical card grids.

## Security rules (docs/security.md)
Secrets never client-side/logged. RLS on every table (deny by default). Invite codes hashed. Allowlist re-checked every request.
Test mode (`BILLFOLD_TEST_MODE=1`) is inert in production. Jio PDF passwords redacted everywhere (wired in Phases 3–4).

## Folder map
`src/app` routes ((auth) sign-in/not-authorised, (app) onboarding/[orgSlug]/admin, auth/callback, api/health, api/cron/connections, api/connections/google, api/test/{outbox,drive,cache}) ·
`src/components/{ui,features}` · `src/hooks` · `src/domain` · `src/server/{application,http,infra,composition-root}` ·
`src/lib` · `src/constants` · `src/types` · `drizzle/` SQL migrations · `tests/{unit,integration,e2e,fakes}` · `docs/` · `scripts/`.

## Commands
`pnpm install` · `pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` (add `TEST_DATABASE_URL` for integration) ·
`pnpm db:generate` · `pnpm db:migrate` · `pnpm verify:ui` (needs local Postgres at `TEST_DATABASE_URL`; `PW_CHROMIUM_PATH` for a preinstalled Chromium).
Local test Postgres in this sandbox: `/var/lib/pgtest/data` on port 54329 (db `billfold_test`), start with `su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/pgtest/data -o '-p 54329 -k /tmp' start"` (delete a stale `postmaster.pid` first); it stops between sessions.
`pnpm verify:ui` here: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium TEST_DATABASE_URL=postgres://postgres@localhost:54329/billfold_test pnpm verify:ui --trace off` (about 3 minutes; run it in the background).

## Environment variables (names only; see `.env.example`)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL` (pooler), `MASTER_ENCRYPTION_KEY`, `SUPER_ADMIN_EMAILS`,
`NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, optional `UPSTASH_REDIS_REST_URL/TOKEN` (shared cache), `NEXT_PUBLIC_CONTACT_EMAIL` + `NEXT_PUBLIC_OPERATOR_NAME` (privacy/terms), `GEMINI_NO_TRAINING_CONFIRMED=1` (Gemini stays off without it), optional `GOOGLE_A_CLIENT_ID/SECRET` (Drive, project A), `GOOGLE_B_CLIENT_ID/SECRET` (Gmail, project B) and `GEMINI_API_KEY` / `GEMINI_MODEL` (amount reading; free tier may train on content, see ADR 0008); test only: `BILLFOLD_TEST_MODE`, `TEST_DATABASE_URL`, `PW_CHROMIUM_PATH`.

## Current status
- **Phase 1 (foundation) done**: schema + migrations + RLS, envelope crypto, Google sign-in via Supabase with allowlist, super-admin page, orgs, invites,
  roles/overrides, org switcher, audit log, org rename / transfer ownership / delete (soft delete + key shredding), design tokens, logo/icon, CI + migrate workflows,
  test mode. Real Google sign-in verified on billfold-dev.
- Phase 0 platform spikes (PDF decrypt, email→PDF, free-tier limits, Gemini terms) are **deferred** to the phase that needs them (ADR 0005). IMAP/SMTP are now proven
  against local servers in tests (hoodiecrow-imap, smtp-server) and against a real mailbox on billfold-dev.
- **Phase 2 (connections) done** (ADR 0006): `connections` table (sealed secret, RLS), Drive/Gmail Google OAuth (`/api/connections/google/*`, signed state + one-use cookie),
  IMAP/SMTP app-password accounts tested before saving, update app password, Reconnect, Test, Remove (revokes the grant at Google, refuses if sources/run configs use it),
  daily health sweep (`/api/cron/connections`, second cron in `vercel.json`) + overview banner, `scripts/rotate-master-key.mts`.
- **Phase 3 (sources and run configs) done** (ADR 0007): `sources`, `run_configs`, `run_config_sources` tables; sources = mailbox + sender/subject/attachment rules + PDF password mode
  (none / saved static / Jio-style brackets / custom pattern); source tester (dry run on the real mailbox, Gmail API or IMAP, headers only); run configs = sources + mandatory Drive + folder + default month.
  Pages: Sources, Run configs. `matchesMessage`, `extractSubjectPassword`, `resolvePeriod` are the domain functions Phase 4 reuses.
- Test coverage: unit + integration (local Postgres), and `pnpm verify:ui` flows F1-F50 + V1 (`docs/qa/flows.md`). Google round trips, the Gmail API (search + fetch), Drive uploads and Gemini are only exercised with fakes/mocked HTTP
  in the sandbox (IMAP, SMTP and PDF encryption are tested against real local servers / generated files); the owner has tested connections on billfold-dev, so run the "manual checks" in `docs/qa/flows.md` for Gmail search once Gmail (project B) is connected.
- **Phase 4 (runs / filing pipeline) done** (ADR 0008): `runs`, `run_items`, `bills`, `bill_files` tables. `StartRun` plans a month (search only), `ProcessNextItem` files one item per call (claim with `FOR UPDATE SKIP LOCKED`,
  download Gmail/IMAP, unlock PDF with `@cantoo/pdf-lib` (RC4/AES all tested), email-body bills become text PDFs, amount read by the text reader or Gemini, upload to Drive folder/month/source, bill + file saved).
  Run page loops the server action until done; retry, pause, cancel; already-filed emails are skipped in later runs. Overview has a getting-started checklist and the latest run.
  Navigation fix: `currentUser`/`requireOrg` are per-request cached for pages (`requireOrgFresh` in actions), loading/error boundaries, `NavLink` pending dot, last-org write in `after()`.
- **Phase 5 (bills and reports) done** (ADR 0009): Bills page (filters, search, review queue, edit/check, add by hand, paid, soft delete/restore, CSV export route `/[orgSlug]/bills/export`) and Reports page (month total, 12-month column chart per the dataviz skill,
  by-biller table, insights, overdue/due-soon). Pure maths in `domain/value-objects/bill-reports.ts`; `ReportService`; migration `0005` adds `paid_at`, `reviewed_*`, `deleted_*` to `bills` and the `manual` method. Overview shows a "bills need a check" notice.
- **Phase 6 (sending summaries) done** (ADR 0010): `recipients`, `email_templates`, `sends`, `send_items` tables (migration `0006`). Pages: Send (composer with preview in a sandboxed iframe, "send me a test", sent log), Send detail (progress, retry, cancel), Recipients, Templates; Reports links to Send.
  `SendComposer` builds the message (preview = real send); `StartSend` stores the finished subject/HTML/text and one `send_items` row per recipient; `ProcessNextSendItem` sends one email per request (claim with `FOR UPDATE SKIP LOCKED`), fetching PDFs from Drive (`DriveStore.download`) and sending through `MailSender` (`GmailSender` raw MIME or `SmtpSender`).
  Permissions `reports.send`, `recipients.manage`, `templates.manage`; limits in `SEND_LIMITS` (25 recipients, 40 PDFs, 18 MB, 10 sends/hour). Test mode: `StubMailSender` keeps mail in memory, listed by `/api/test/outbox` (404 outside test mode); an address containing "bounce" is refused.
- **Phase 7 (legal pages, landing, brand) done** (ADR 0011): public `/`, `/privacy`, `/terms` (`src/app/(legal)`, `LegalShell`), landing with How it works, footer links in the app and on sign-in, `NEXT_PUBLIC_CONTACT_EMAIL` (optional, `lib/contact.ts`), PNG icons + touch icon + social image (`scripts/make-brand-assets.mts`), `manifest.ts`, `robots.ts`, Open Graph tags, email wordmark (styled text) and "Sent with Billfold". Flows F36-F40.
- **Speed pass done** (ADR 0012): 4 DB connections per instance (it was 1), `getClaims` instead of `getUser`, one membership query per request, SQL aggregates (`BillRepository.summary/reportRows/findMany`) instead of loading every bill, no sealed secrets or email bodies in list queries, partial indexes (migration `0007`), per-render memo (`queries/request-memo.ts`), `loading.tsx` skeleton on every page (grey bars, each with its own transform-only highlight inside it, never one overlay over several bars), `LinkButton`/`TextLink` with pending spinner. Flows F41-F44. Redis cache is still a planned follow-up.
- **Cache, Drive access and templates done** (ADR 0013, 0014): optional Upstash cache (`Cache` port, version tags, every repository wrapped by `infra/cache/invalidating.ts` with one registry `specs.ts`, `readThrough`, sealed Google token cache, Drive folder id cache, Settings > Clear the cache); Drive scope `drive` with `driveAccess` recorded per connection ("needs more permission" + Reconnect); per-source file name and folder templates (`lib/name-template.ts`, `Mon/mon/MON/Month/...`, migration `0008`); Add bill can attach a document (4 MB, type from first bytes) into a Drive folder; privacy policy and terms rewritten for Google verification; Gemini gated by `GEMINI_NO_TRAINING_CONFIRMED`. Flows F45-F50, F37b.
- **Delete modal done** (ADR 0009): Bills > Delete opens a dialog (`DeleteBillDialog`): hide and never refile, or `RemoveBillForRefiling` (hard delete, email forgotten, Drive PDF stays). `BillRepository.existingKeys` returns `Map<key, isDeleted>` and `remove` bumps `bills` + `runs` tags. Flow F51.
- All planned phases are built. Known gaps: none planned. Open items are owner actions only (consent-screen links in Google, optional contact email, reading the legal text, a real-account send test); see the PR notes.

## Gotchas
- **The cache must hear about every write.** Repositories are wrapped (`infra/cache/invalidating.ts`); a new repository method must be classified in `infra/cache/specs.ts` (a test fails otherwise). Never write to the database around a repository (direct SQL, dashboard edits) without clearing the cache (Settings, or `POST /api/test/cache` in tests). Page read models go through `cachedRead`/`request-memo.ts` and may only hold data that is the same for everyone in the organisation, never secrets.
- **Google verification reads `/privacy` without signing in.** The `develop` domain is protected by Vercel Authentication (preview deployment), so Google sees a login page; verify on the production domain or turn protection off while it runs. Any change to what is stored, who receives it or which scopes are asked must update the privacy page and `LEGAL_UPDATED`.
- **Never go back to one DB connection** (`POOL_SIZE` in `infra/db/client.ts`) and never load "all bills" to count or list months: use `BillRepository.summary` / `reportRows`. List queries must not select sealed secrets or message bodies. New in-page links use `LinkButton` / `TextLink`, and every new page directory gets a `loading.tsx` (skeletons in `components/features/shell/page-skeleton.tsx`). Animate only `transform`/`opacity` of a single layer.
- **Keep `/privacy` honest.** Any change to what the app stores, who receives data or which Google scopes it asks for must update `src/app/(legal)/privacy/page.tsx` and `LEGAL_UPDATED` (`src/constants/legal.ts`) in the same commit.
- Input ids must be unique per page: two fields with the same `id` (e.g. several "update password" forms) make a label point at the first one.
- The container is cached on `globalThis` (`composition-root/container.ts`) so route handlers and server actions share one instance (and the test-mode stubs) in a dev server.
- Gmail connections already request `gmail.send` (project B consent screen must list it, see the setup guide); no reconnect is needed. Real Gmail/SMTP delivery cannot be tested in the sandbox beyond a local SMTP server and mocked HTTP.
- Next 16: middleware is `src/proxy.ts`. ESLint uses native flat config from `eslint-config-next`.
- **`DATABASE_URL` must be the Supabase Session pooler string (port 5432), in Vercel production, preview and GitHub secrets.** The Transaction pooler (6543)
  worked on a fresh serverless instance but then hung (`GET /` hit the 300s limit) or returned an instant `57014 statement timeout` on reused instances;
  switching to 5432 fixed it (proved on billfold-dev). The direct host is IPv6-only and unreachable from Vercel and GitHub runners. `create.ts` keeps `prepare: false` and short idle/lifetime timeouts.
- Sign-in failures log `auth_callback_failed` with `step` and the real error (`errorFields` in `lib/log.ts`); read them with Vercel runtime logs.
- React 19 empties uncontrolled form fields after a form `action` finishes, even on errors. Forms where people type a lot use `useActionForm(...).formProps` (submit handler, no reset); see `hooks/use-action-form.ts`.
- Server actions that `redirect()` abort in-flight navigations; Playwright must wait for the URL change before the next `goto`.
- `next/font/google` downloads fonts at build time (needs network).
- Vercel functions are pinned to Mumbai (`bom1`) in `vercel.json`; keep Supabase projects in the same region (ap-south-1) so database round trips stay short. Change both together.
