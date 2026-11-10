# Billfold

A private web app for small groups to collect recurring bills from Gmail, remove PDF passwords, read the amounts, file
PDFs in Google Drive and email a clear summary. Runs on free tiers (Vercel, Supabase). See `CLAUDE.md` for the working
rules and `docs/setup-guide.md` to deploy.

**Status:** Phase 1 (foundation) complete: Google sign-in with allowlist, orgs, invites, roles and permissions, audit log,
encrypted per-org keys, design system, test mode and UI verification. Connections, sources and bills come next.

## Local development
```bash
pnpm install
cp .env.example .env.local      # fill in (see docs/setup-guide.md)
pnpm db:migrate                 # applies ./drizzle to DATABASE_URL
pnpm dev
```
| Command | What it does |
|---|---|
| `pnpm lint` / `pnpm typecheck` | ESLint (incl. layer boundaries) / TypeScript strict |
| `pnpm test` | Unit tests; set `TEST_DATABASE_URL` to include Postgres integration tests |
| `pnpm verify:ui` | Playwright flows + visual/a11y checks in test mode (needs local Postgres; run on request) |
| `pnpm db:generate` | Create a migration after schema changes |

## Docs
`docs/setup-guide.md` (deploy), `architecture.md`, `design.md`, `security.md`, `operations.md`, `decisions/`, `qa/flows.md`.
