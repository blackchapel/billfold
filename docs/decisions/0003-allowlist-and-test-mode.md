# 0003 Per-request allowlist check; test mode
**Decision.** The allowlist is checked at sign-in and again on each request, so removal is immediate (one indexed lookup).
For offline end-to-end tests, test mode replaces Google with a cookie session but still runs the same `SignInGate`.
It requires `BILLFOLD_TEST_MODE=1`, non-production `NODE_ENV`, and no `VERCEL_ENV`.
**Consequences.** Real Google sign-in is the one flow verified manually (see docs/qa/flows.md).
