# Architecture

## Layers (dependencies point inward; enforced by `eslint-plugin-boundaries`)
```mermaid
flowchart TD
  UI["Presentation: src/app, components, hooks"] --> HTTP["Interface: server/http (actions, queries, session)"]
  HTTP --> APP["Application: server/application (use cases)"]
  HTTP --> COMP["Composition root"]
  APP --> DOM["Domain: entities, value objects, policies, ports, errors"]
  COMP --> APP
  COMP --> INFRA["Infrastructure: db, repositories, crypto, auth, providers"]
  INFRA --> DOM
```
`lib`, `constants` and `types` are shared leaf folders. Components may not import server code; use cases know only ports.

## Ports and adapters
```mermaid
flowchart LR
  UC["Use cases"] -->|port| R["Repository interfaces"]
  UC -->|port| S["SecretBox / Clock / RateLimiter / InviteCodeService"]
  R -.implemented by.-> D["Drizzle repositories (Postgres)"]
  S -.implemented by.-> E["AES-256-GCM envelope crypto, Postgres rate limiter"]
```
Later phases add `MailSourceProvider` (Gmail API, IMAP), `MailSender` (Gmail API, SMTP), `FileStore` (Drive), `BillExtractor`
(Gemini, mock) and `PdfNormaliser` ports in `domain/ports`, selected through a `ProviderFactory` in the composition root.

## Sign-in sequence
```mermaid
sequenceDiagram
  participant B as Browser
  participant N as Next.js
  participant S as Supabase Auth
  participant G as Google
  B->>N: Continue with Google (server action)
  N->>S: signInWithOAuth
  S->>G: redirect
  G->>S: code
  S->>N: /auth/callback?code
  N->>S: exchange code, get user
  N->>N: SignInGate: allowlist or super admin?
  alt allowed
    N->>B: session cookie, redirect to last org
  else not allowed
    N->>S: sign out
    N->>B: /not-authorised
  end
```
Every request re-checks the allowlist (`isStillAllowed`), so removing someone takes effect at once.

## Data model (Phase 1-4 tables)
```mermaid
erDiagram
  users ||--o{ org_members : has
  orgs ||--o{ org_members : has
  orgs ||--o{ org_keys : "wrapped data key"
  orgs ||--o{ org_invites : has
  orgs ||--o{ audit_logs : has
  orgs ||--o{ connections : "linked accounts (secret sealed)"
  orgs ||--o{ sources : "which emails are bills"
  orgs ||--o{ run_configs : "which sources, which Drive"
  connections ||--o{ sources : "mailbox (restrict delete)"
  connections ||--o{ run_configs : "Drive (restrict delete)"
  run_configs ||--o{ run_config_sources : has
  orgs ||--o{ runs : "one month, one config"
  runs ||--o{ run_items : "one email or PDF each"
  orgs ||--o{ bills : "unique per email"
  bills ||--o{ bill_files : "Drive copy (ids, hash)"
  run_items }o--o| bills : "filed as"
  sources ||--o{ run_config_sources : "in"
  orgs }o--|| currencies : default
  platform_allowlist {
    text email
  }
```
Later phases add reports, bills, files, recipients, templates and sends
(see the brief's data model; migrations are additive).

## Multi-tenancy
Every org-owned repository method takes an `orgId`; `AuthorizationService` resolves membership and permissions in one
place. A non-member gets `not_found`, never `forbidden`, so org existence is not leaked. RLS is enabled on every table
with no policies (deny by default) as a backstop for the public Supabase key.

## Filing pipeline (Phase 4)
```mermaid
sequenceDiagram
  participant B as Browser (run page)
  participant S as Server actions
  participant M as Mailbox (Gmail / IMAP)
  participant D as Google Drive
  B->>S: startRun(config, month)
  S->>M: search each source (headers only)
  S-->>B: run + pending items (nothing downloaded)
  loop until no pending item
    B->>S: processNext(run)
    S->>S: claim one item (row lock)
    S->>M: download email / PDF
    S->>S: unlock PDF, read amount (text reader or Gemini)
    S->>D: upload PDF to folder/month/source
    S->>S: save bill + file, mark item done or failed
    S-->>B: item + counts
  end
```
