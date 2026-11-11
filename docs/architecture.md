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

## Data model (Phase 1-6 tables)
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
  orgs ||--o{ recipients : "who gets summaries"
  orgs ||--o{ email_templates : "wording (one default)"
  orgs ||--o{ sends : "one press of Send, finished text kept"
  sends ||--o{ send_items : "one email per recipient"
  connections ||--o{ sends : "sent from (set null on delete)"
  sources ||--o{ run_config_sources : "in"
  orgs }o--|| currencies : default
  platform_allowlist {
    text email
  }
```
Sent emails copy the recipient's name and address and the finished subject and body, so removing a recipient, template or connection never changes history.

## Cache (ADR 0013)
```mermaid
flowchart LR
  P[Page / query] -->|versions of its tags, one round trip| C[(Redis cache)]
  P -->|hit| C
  P -->|miss| D[(Postgres)]
  W[Use case write] --> R[Wrapped repository]
  R --> D
  R -->|after commit: new version for the tag| C
```
`readThrough` (application) builds keys from the organisation's tag versions; `invalidating` (infra) wraps every repository and applies the effects listed in `infra/cache/specs.ts`; the allowlist and a person's organisation list are cached inside their repositories and deleted on write; Google access tokens and Drive folder ids are cached by the adapters that fetch them.

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

## Sending pipeline (Phase 6)
```mermaid
sequenceDiagram
  participant B as Browser (send page)
  participant S as Server actions
  participant D as Google Drive
  participant G as Gmail API / SMTP
  B->>S: previewSend(month, template, attach)
  S-->>B: subject, HTML (shown in a sandboxed iframe), attachments, warnings
  B->>S: startSend(month, template, sender, recipients)
  S->>S: compose again, store finished text, one pending item per recipient
  S-->>B: send id (redirect to the progress page)
  loop until no pending item
    B->>S: processNextSendItem(send)
    S->>S: claim one recipient (row lock)
    S->>D: download the PDFs (size capped)
    S->>G: one email to that recipient
    S->>S: mark sent or failed (fixed message)
    S-->>B: item + counts
  end
```
`SendComposer` is the single place that builds the message, used by both the preview and the real send. `domain/value-objects/summary-email.ts` renders it (everything escaped); `email-template.ts` holds the allowed placeholders and limits.
