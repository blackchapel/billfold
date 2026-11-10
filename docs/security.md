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
- **Test mode** (`BILLFOLD_TEST_MODE=1`) fakes sign-in. It is inert when `NODE_ENV=production` or `VERCEL_ENV` is set.

Threat model summary: stolen anon key (RLS denies), stolen invite (hashed, expiring, capped, allowlist still required),
removed teammate (allowlist and membership checked per request), database leak (secrets encrypted, key not in DB).
