# Billfold – working memory for Claude

Read this first. Keep it accurate: update it in the same commit as any change that affects it, and whenever the owner
gives a new "always do this" instruction (add it under **Standing instructions** the same session).

## Standing instructions from the owner
1. **Branches.** `main` = production, `develop` = integration (deployed to Vercel for the owner's testing),
   `feature/*` or `claude/*` = work branches. **Always cut feature branches from `develop`** (never from `main`).
   Flow: feature (tested locally) → `develop` (owner tests on Vercel) → `main`.
2. **Merging.** Claude may merge PRs into `develop` once lint, typecheck and tests pass locally. Claude must **never**
   merge into `main` or push to it, and never force-push `main`/`develop`. Only the owner (blackchapel) merges
   `develop` → `main`; Claude may open that PR when asked but not merge it.
3. **Enforcement.** Workflow `.github/workflows/enforce-main-source.yml` fails any PR to `main` not from `develop`
   (check name `Only develop can merge into main`). The owner sets GitHub branch protection/ruleset on `main` by hand
   (the API is blocked for Claude): require PR + that check, block force-push/deletion.
4. UI verification (`pnpm verify:ui`) runs **only when the owner asks**. Never email real recipients, touch real Drive, or use
   real bills/passwords in tests.
5. Never commit secrets, real bill files, passwords or personal data. Fixtures are generated.
6. Explain things to the owner in simple language; list what they must do manually (env vars, Google, Vercel, Supabase).

## Product
Billfold: private, multi-tenant (org) web app for families/small teams (<100 people) to collect recurring bills from Gmail,
remove PDF passwords, extract amounts with Gemini, file PDFs in Google Drive, review in a dashboard and email a summary
with PDFs attached. Manual runs/sends only. Zero-cost (free tiers). Non-goals: share links, built-in source templates,
approval workflows, non-Gmail ingestion (design interfaces for it), scheduled runs (only the Supabase keep-alive cron).

## Fixed decisions (details in docs/decisions/)
Next.js App Router + TS strict + Tailwind v4 on Vercel; Supabase Auth (Google only) + Postgres via Drizzle (server-side only);
Drive is the only file store (IDs/hashes in DB); Gemini with mock extractor until key exists; per-org envelope encryption;
INR only but schema supports many currencies; roles Owner/Admin/Member/Viewer + per-member overrides; login allowlist in DB
(`platform_allowlist`) managed by super admins from `SUPER_ADMIN_EMAILS`; Google project A (verified: login + drive.file) and
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
`src/app` routes ((auth) sign-in/not-authorised, (app) onboarding/[orgSlug]/admin, auth/callback, api/health, api/connections/google) ·
`src/components/{ui,features}` · `src/hooks` · `src/domain` · `src/server/{application,http,infra,composition-root}` ·
`src/lib` · `src/constants` · `src/types` · `drizzle/` SQL migrations · `tests/{unit,integration,e2e,fakes}` · `docs/` · `scripts/`.

## Commands
`pnpm install` · `pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` (add `TEST_DATABASE_URL` for integration) ·
`pnpm db:generate` · `pnpm db:migrate` · `pnpm verify:ui` (needs local Postgres at `TEST_DATABASE_URL`; `PW_CHROMIUM_PATH` for a preinstalled Chromium).
Local test Postgres in this sandbox: `/var/lib/pgtest` on port 54329 (db `billfold_test`) – may need restarting.

## Environment variables (names only; see `.env.example`)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL` (pooler), `MASTER_ENCRYPTION_KEY`, `SUPER_ADMIN_EMAILS`,
`NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, optional `GOOGLE_A_CLIENT_ID/SECRET` (Drive, project A) and `GOOGLE_B_CLIENT_ID/SECRET` (Gmail, project B); test only: `BILLFOLD_TEST_MODE`, `TEST_DATABASE_URL`, `PW_CHROMIUM_PATH`.
Later: `GEMINI_API_KEY`.

## Current status
- **Phase 1 (foundation) done** on `feature/phase-1-foundation`: schema + migrations + RLS, envelope crypto, Google sign-in via Supabase with
  allowlist, super-admin page, orgs, invites, roles/overrides, org switcher, audit log, design tokens, logo/icon, CI + migrate workflows,
  test mode, `verify:ui` (9 specs pass), 38 unit/integration tests.
- Phase 0 platform spikes (PDF decrypt, email→PDF, IMAP/SMTP on Vercel, current free-tier limits, Gemini terms) are **deferred** to the
  phase that needs them (ADR 0005).
- **Phase 2 (connections) built** on `claude/shared-conversation-link-9vw8na`: `connections` table (sealed secret, RLS), Drive/Gmail Google OAuth (`/api/connections/google/*`),
  IMAP/SMTP app-password accounts tested before saving, Connections page, `scripts/rotate-master-key.mts`, ADR 0006. Needs owner setup: Google projects (docs/setup-guide.md 2b) and env vars.
  Real Drive/Gmail round trips and the IMAP probe against a real server are not yet exercised (no credentials / IMAP server in the sandbox).
- Not yet built: sources/run configs (P3), pipeline (P4), reports/insights (P5), sending (P6), legal pages/landing polish (P7).
- Phase 1 leftovers done: real Google sign-in works on billfold-dev; org rename / transfer ownership / delete (soft delete + key shredding) in Settings.
- Known gaps:
  brand deliverables so far are SVG mark + icon only (PNG/OG/email wordmark due Phase 7); `/privacy` and `/terms` are linked but not written yet.

## Gotchas
- Next 16: middleware is `src/proxy.ts`. ESLint uses native flat config from `eslint-config-next`.
- **`DATABASE_URL` must be the Supabase Session pooler string (port 5432), in Vercel production, preview and GitHub secrets.** The Transaction pooler (6543)
  worked on a fresh serverless instance but then hung (`GET /` hit the 300s limit) or returned an instant `57014 statement timeout` on reused instances;
  switching to 5432 fixed it (proved on billfold-dev). The direct host is IPv6-only and unreachable from Vercel and GitHub runners. `create.ts` keeps `prepare: false` and short idle/lifetime timeouts.
- Sign-in failures log `auth_callback_failed` with `step` and the real error (`errorFields` in `lib/log.ts`); read them with Vercel runtime logs.
- Server actions that `redirect()` abort in-flight navigations; Playwright must wait for the URL change before the next `goto`.
- `next/font/google` downloads fonts at build time (needs network).
- Vercel functions are pinned to Mumbai (`bom1`) in `vercel.json`; keep Supabase projects in the same region (ap-south-1) so database round trips stay short. Change both together.
