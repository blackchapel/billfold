# 0006 Connections: Google OAuth held by Billfold, app passwords tested before saving

**Context.** Phase 2 links the accounts a run needs: Drive, Gmail, and plain IMAP/SMTP mailboxes. Login is separate (Supabase), and the Drive
and Gmail scopes live in two different Google Cloud projects (A verified, B unverified).

**Decisions.**
- Drive and Gmail are linked with Billfold's own OAuth code flow (`/api/connections/google/start` and `/callback`), not through Supabase, because Supabase
  would not give us a refresh token for other scopes. The redirect URI is Billfold's own address, registered in both projects.
- Only a refresh token is stored (sealed with the org data key); access tokens are fetched when needed. `prompt=consent` + `access_type=offline` so reconnecting always returns one.
- The OAuth `state` is HMAC-signed with a key derived from the master key (HKDF), expires in 10 minutes, carries org, kind and user, and must equal a one-use httpOnly cookie.
- App-password mailboxes (IMAP receive, SMTP send) are tested against the real server before they are saved; failures return one of a few safe messages and never echo credentials.
- A connection's secret never appears in `ConnectionRecord`, DTOs, logs or audit metadata; `findSecret` is the only reader.
- Anyone in the org can list connections; add / test / remove need `connections.manage`.
- Probes sit behind a port (`ConnectionProbe`); the provider adapters (Drive / Gmail / IMAP / SMTP) used in later phases will sit beside them.

**Consequences.** Gmail in Testing mode loses its refresh token after 7 days, so that connection shows "needs attention" until reconnected (documented in the setup guide).
The IMAP probe has only been exercised against failure paths here (no IMAP server in the sandbox); SMTP is tested against a local server. Run the checks in `docs/qa/flows.md` with a real mailbox.
Phase 0 spike for IMAP/SMTP on Vercel: connect + login each take one short-lived TCP connection inside a single request, which fits a serverless function; to be confirmed on billfold-dev with a real mailbox.
