# Security

- **Encryption.** `MASTER_ENCRYPTION_KEY` (env) wraps a random 32-byte data key per org (`org_keys`, with `key_version`).
  Org secrets are sealed with AES-256-GCM (`v1.<iv>.<tag>.<data>`), fresh IV each time. Deleting an org's key
  crypto-shreds its secrets (tested).
- **Key rotation (master key).** Add the new key as `MASTER_ENCRYPTION_KEY_NEXT`, run a one-off script that unwraps each
  `org_keys.wrapped_data_key` with the old key and re-wraps it with the new one in a transaction, then swap the env
  values and remove the old one. Data keys and the secrets themselves do not change. Run it with
  `MASTER_ENCRYPTION_KEY_NEXT=... pnpm tsx scripts/rotate-master-key.mts` (tested: `rewrapDataKey`).
- **Secrets never leave the server.** Server-only modules import `server-only`; credentials are never returned to the client.
- **Redaction.** `src/lib/redact.ts` removes known secrets and masks sensitive keys; audit metadata always passes through it.
  Jio subject passwords are redacted wherever subjects are stored or shown (Phase 3/4 wiring).
- **RLS.** Enabled on every public table with no policies, and API-role privileges revoked. The server uses the database owner
  role, which bypasses RLS; org scoping is enforced in repositories. A test fails if any table lacks RLS.
- **Sign-in.** Google only. The allowlist is checked at sign-in and on every request.
- **Invites.** Codes are random, shown once, stored as SHA-256 hashes, rate limited (10 tries / 10 min / user), consumed atomically.
- **Headers.** CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy in `next.config.ts`.
- **Connections.** Passwords and Google refresh tokens are sealed with the org's data key (`connections.secret_ciphertext`) and only read server-side
  by use cases that call the provider. Records, DTOs, logs and audit entries never carry them. A login is tested before it is saved. Google OAuth state is HMAC-signed
  (key derived from the master key), expires in 10 minutes, is bound to the user and org, and must match a one-use httpOnly cookie. Deleting an org destroys its key,
  so its stored tokens cannot be read again; also revoke Billfold at myaccount.google.com/permissions when removing a Google connection.
- **Sources.** A static PDF password is sealed like any connection secret (`sources.password_ciphertext`); records and DTOs only say whether one is saved. Subject-based passwords are masked with
  `redactSubjectPassword` everywhere they could be shown or stored, and the tester only reports "password found: yes/no". Custom patterns are limited (120 chars, one group, no nested repeats)
  and run against subjects cut to 500 characters. The tester reads headers and attachment *names* only: no bodies or attachment bytes are fetched. Provider errors (which can echo credentials) are replaced by one safe message.
  Removing a Google connection also revokes the grant at Google; if Google is unreachable the removal still happens and the audit entry records `revoked: false`, in which case revoke it at myaccount.google.com/permissions.
- **Runs.** Bill PDFs are unlocked in memory and go only to the org's own Drive; the database keeps ids, links and a hash, not files. Passwords (static or from a subject) are decrypted or read per item, used once and never written to items, bills, logs
  or the audit log (tests assert this). Items store only masked subjects and short fixed messages; provider errors are logged as code/type, not shown. With `GEMINI_API_KEY`, only the unlocked PDF plus a fixed instruction is sent to Gemini (never
  passwords, subjects, addresses or tokens); the free tier may use content to improve Google's products, so the key is optional and off by default. Run actions need `runs.execute`; any member may read runs and bills.
  Items are claimed with row locks so two screens cannot file the same email, and every filed email has a unique key per org.
- **Bills and reports.** Reading bills, reports and the CSV needs only org membership; changing bills (edit, check, add, paid, delete, restore) needs `bills.edit`, checked on the server for every action and again on the pages. Edits are validated (amounts parsed as exact decimals, real dates, months not in the future)
  and every change is in the audit log with who and what (never secrets). The CSV is `private, no-store`, built on the server for the caller's own org only, and neutralises spreadsheet formulas (`=`, `+`, `-`, `@`, tab, CR). Search input is escaped so `%` and `_` cannot act as wildcards.
- **Sending.** Starting, processing, cancelling and retrying a send need `reports.send` (managing the list `recipients.manage`, templates `templates.manage`), checked in every use case; non-members get `not_found`. Recipients are validated and stored lower-case, names may not contain control characters, an org holds at most 200 and one send at most 25.
  Every value that comes from a person or a bill is HTML-escaped when the email is built; subjects lose line breaks (no header injection); templates may only use a fixed list of placeholders and are never evaluated. The preview and the sent view render the HTML in an `<iframe sandbox>` with no permissions. A person can start 10 sends an hour.
  The sender's password or token and the Drive tokens are decrypted only inside the request that sends, used once, and never stored in sends, logs or the audit log; provider errors are replaced by a fixed sentence and logged redacted. PDFs are downloaded from Drive into memory only (size-capped) and attached; nothing is written to disk.
  "Send me a test" can only go to the signed-in person's own address. The send log and recipient list are readable by any member of the org; other orgs' data is never reachable (every repository method takes `orgId`).
- **Cache.** The cache (ADR 0013) never holds secrets: lists carry no sealed columns (list queries do not select them), Google access tokens are sealed with the master key and keyed by a fingerprint of the refresh token, and keys are namespaced by organisation. Versions are unique tokens so a lost key cannot resurrect old data; saving data gives new versions, the allowlist answer is deleted when the allowlist changes (lock-out stays immediate), and membership and permission lists are deleted when roles change. Redis failures are misses, never errors. Anything written to the database behind the application's back is not seen until entries expire (5 minutes) or the cache is cleared.
- **Drive and uploads.** Drive access is the full `drive` scope, used only to look up named folders, create folders, upload and download files Billfold stored. Uploads on the Add bill form are limited to 4 MB, accepted only if the first bytes say PDF, PNG, JPEG or WebP (not by name or browser type), need `bills.edit` and a Drive of the same organisation, and fail the whole bill if Drive refuses. Name and folder templates are plain find-and-replace, validated on save and again when used, never evaluated; rendered names cannot contain slashes, control characters, `.` or `..` segments, or more than 8 levels. A folder path is refused when the Drive connection cannot see existing folders, instead of creating a look-alike folder.
- **Gemini.** Bill PDFs derived from Gmail are sent to Gemini only when `GEMINI_NO_TRAINING_CONFIRMED=1` is set, so the policy's promise that content is not used to train models is enforced by configuration.
- **Test mode** (`BILLFOLD_TEST_MODE=1`) fakes sign-in. It is inert when `NODE_ENV=production` or `VERCEL_ENV` is set. In test mode emails go to an in-memory stand-in that `/api/test/outbox` lists; that route answers 404 whenever test mode is off.

Threat model summary: stolen anon key (RLS denies), stolen invite (hashed, expiring, capped, allowlist still required),
removed teammate (allowlist and membership checked per request), database leak (secrets encrypted, key not in DB).
