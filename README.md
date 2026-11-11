<div align="center">

<img src="public/icon-192.png" alt="Billfold" width="72" height="72" />

# Billfold

**Collect recurring bills from Gmail, file them in Google Drive, and send a clear monthly summary.**

A private, multi-tenant web app for families and small teams. It runs entirely on free tiers.

[Features](#features) · [How it works](#how-it-works) · [Getting started](#getting-started) · [Configuration](#configuration) · [Project layout](#project-layout) · [Testing](#testing)

</div>

---

## Features

- **Finds bills for you.** Point a source at a mailbox (Gmail or any IMAP account) and describe the sender, subject and attachment. Test the rule against the real mailbox before saving it.
- **Unlocks protected PDFs.** Passwords can be saved, taken from the email subject (for example a number in brackets), or built from a custom pattern.
- **Reads the amount.** A built-in text reader works offline. Optionally, Gemini reads scans and unusual layouts. Anything unsure is flagged for a person to check.
- **Files everything in Google Drive.** Each source has its own folder and file-name template, for example `Bills/{{year}}/{{mm}}/phone-{{Mon}}{{yy}}`. Duplicates get a `(2)` suffix instead of overwriting.
- **Safe to run twice.** Each email is filed once. A month can be re-run at any time and only new emails are picked up.
- **Bills and reports.** Filter, search, review, edit, mark paid and export to CSV. A monthly report shows totals, a 12-month chart, spending by biller and what is overdue or due soon.
- **Summary emails with the PDFs attached.** Preview exactly what will go out, send yourself a test, then send to your recipients from Gmail or SMTP. Wording is editable with templates.
- **Built for teams.** Organisations with Owner, Admin, Member and Viewer roles, per-member overrides, invite codes, a sign-in allowlist and an audit log.
- **Private by design.** Secrets are encrypted per organisation, row-level security is on every table, and nothing is sent to a third party unless you turn it on.

## How it works

```
Mailbox ──▶ Source rules ──▶ Unlock PDF ──▶ Read amount ──▶ File in Drive ──▶ Bills & reports ──▶ Summary email
(Gmail/IMAP)  (sender, subject)  (password)   (text / Gemini)   (folder + name)     (review, edit)     (PDFs attached)
```

Runs and sends are started by a person. Processing is chunked: the page asks the server to handle one item at a time, so long months never hit a serverless time limit, and closing the tab simply leaves the rest waiting.

## Tech stack

| Area | Choice |
|---|---|
| App | Next.js (App Router), React, TypeScript (strict), Tailwind CSS |
| Hosting | Vercel |
| Auth and database | Supabase (Google sign-in, Postgres), accessed server-side with Drizzle ORM |
| Files | Google Drive (the database holds only IDs and hashes) |
| Mail | Gmail API, IMAP and SMTP |
| PDF | `@cantoo/pdf-lib` |
| Amount reading | Built-in text reader, optional Gemini |
| Cache | Optional Upstash Redis |
| Tests | Vitest and Playwright |

## Getting started

### Requirements

- Node.js 22 or newer and [pnpm](https://pnpm.io)
- A [Supabase](https://supabase.com) project and a Google Cloud project for sign-in
- For the full flow: Google Cloud projects for Drive and Gmail, and a [Vercel](https://vercel.com) account

The step-by-step instructions for creating each account and filling in each value are in [`docs/setup-guide.md`](docs/setup-guide.md).

### Run it locally

```bash
pnpm install
cp .env.example .env.local     # fill in the values (see Configuration below)
pnpm db:migrate                # applies ./drizzle to DATABASE_URL
pnpm dev                       # http://localhost:3000
```

### Deploy

Import the repository into Vercel, add the same environment variables, and run the **Database migrate** workflow against your database. Production deploys come from `main`; `develop` is the integration branch.

## Configuration

Copy [`.env.example`](.env.example) and fill in the values. Names only here; never commit real values.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase project and its public key |
| `DATABASE_URL` | Yes | Supabase **Session pooler** connection string (port 5432) |
| `MASTER_ENCRYPTION_KEY` | Yes | 32 random bytes, base64. Wraps every organisation's data key |
| `SUPER_ADMIN_EMAILS` | Yes | Comma-separated emails that are always allowed in and can manage the sign-in allowlist |
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL of the deployment |
| `CRON_SECRET` | Yes | Authenticates the scheduled health checks |
| `GOOGLE_A_CLIENT_ID`, `GOOGLE_A_CLIENT_SECRET` | For Drive | Google project used for Drive |
| `GOOGLE_B_CLIENT_ID`, `GOOGLE_B_CLIENT_SECRET` | For Gmail | Google project used for reading and sending Gmail |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_NO_TRAINING_CONFIRMED` | Optional | Gemini amount reading. It stays off unless you confirm the key's terms exclude model training |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional | Shared cache. Without it the app reads from the database |
| `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_OPERATOR_NAME` | Optional | Shown on the privacy policy and terms |

## Security and privacy

- Passwords, tokens and app passwords are sealed with a per-organisation key, itself wrapped by the master key. They never reach the browser, logs or Gemini.
- Row-level security is enabled on every table, and the database is only reached from the server.
- Invite codes are stored hashed. The sign-in allowlist is checked on every request.
- Cached data holds no secrets and is namespaced per organisation.
- The app ships public privacy and terms pages that describe what is stored and who receives it.

Details are in [`docs/security.md`](docs/security.md).

## Project layout

```
src/
  app/            Routes and pages
  components/     Presentational UI
  hooks/          Client logic
  domain/         Value objects, policies, ports (no framework imports)
  server/
    application/  Use cases
    http/         Server actions and read models
    infra/        Database, providers, crypto, cache
    composition-root/  Wires infrastructure to ports
  lib/ constants/ types/
drizzle/          SQL migrations
tests/            unit, integration, e2e, fakes
docs/             Setup, architecture, security, operations, QA flows
scripts/          Maintenance and asset scripts
```

Dependencies point inward (`domain` ← `application` ← `http` ← UI), and the lint rules enforce it. See [`docs/architecture.md`](docs/architecture.md).

## Testing

| Command | What it does |
|---|---|
| `pnpm lint` | ESLint, including the layer boundaries |
| `pnpm typecheck` | TypeScript in strict mode |
| `pnpm test` | Unit tests. Set `TEST_DATABASE_URL` to include the Postgres integration tests |
| `pnpm verify:ui` | End-to-end flows in a real browser, plus visual and accessibility checks, in test mode (needs a local Postgres) |
| `pnpm db:generate` | Create a migration after a schema change |
| `pnpm build` | Production build |

Test mode (`BILLFOLD_TEST_MODE=1`) replaces Google, Drive and mail with in-memory stand-ins so the flows can run offline. It is inert in production builds. The list of end-to-end flows is in [`docs/qa/flows.md`](docs/qa/flows.md).

## Contributing

1. Branch from `develop` (`feature/*`).
2. Keep commits small and focused, with tests and docs in the same change.
3. Open a pull request into `develop`. Only `develop` is merged into `main`.

## Documentation

| Document | Contents |
|---|---|
| [`docs/setup-guide.md`](docs/setup-guide.md) | Plain-language deployment guide |
| [`docs/architecture.md`](docs/architecture.md) | Layers and how the pieces fit |
| [`docs/security.md`](docs/security.md) | Threat model and protections |
| [`docs/operations.md`](docs/operations.md) | Running, limits and troubleshooting |
| [`docs/design.md`](docs/design.md) | Visual design rules |
| [`docs/qa/flows.md`](docs/qa/flows.md) | End-to-end test flows |
