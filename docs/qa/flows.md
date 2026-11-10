# UI flows (living checklist)

Every flow has an automated Playwright spec in `tests/e2e/`. Run them with `pnpm verify:ui`
(test mode, local Postgres, no real Google calls). Screenshots land in `verify-report/` (git-ignored).
Add or update a flow in the same commit as the feature that changes it.

| ID | Flow | Expected | Spec |
|----|------|----------|------|
| F1 | Sign in with an email that is not allowlisted | Redirected to "not authorised"; protected pages bounce to sign-in | flows.spec.ts |
| F2 | Super admin adds and removes allowlist emails | List updates immediately | flows.spec.ts |
| F3 | Non-super-admin opens /admin | 404 | flows.spec.ts |
| F4 | Create org, create invite, join by code (wrong code rejected), Member cannot manage invites or see audit log, Owner changes a role | Each step works; Member sees "no permission" messages | flows.spec.ts |
| F5 | User in two orgs switches between them; unknown org slug | Switcher navigates; unknown slug redirects home | flows.spec.ts |
| F6 | Sign out | Session ends; protected pages bounce to sign-in | flows.spec.ts |
| F7 | Super admin removes an allowlisted email | That user is locked out on their next request | flows.spec.ts |
| F8 | Call /api/health with and without the cron secret | 401 without, 200 with | flows.spec.ts |
| F9 | Add a mail account with a wrong, then a right, app password; Test; update the password | Wrong one refused and not saved; right one saved and "working"; secrets never in the page | phase2-3.spec.ts |
| F10 | Connect Google Drive, reconnect, call the health cron | One row after reconnecting; cron needs the secret and reports checked/failing | phase2-3.spec.ts |
| F11 | Forged Google callback | Refused, nothing connected | phase2-3.spec.ts |
| F12 | Create a source (Jio-style subject password), test it, edit it, bad sender | Test lists the matching email with the password masked; edit keeps values; bad sender explained | phase2-3.spec.ts |
| F13 | Static PDF password source; duplicate name | Password never shown again; duplicate refused | phase2-3.spec.ts |
| F14 | Run configuration with sources + Drive; remove an in-use connection | Saved and listed; removal refused with the dependants named | phase2-3.spec.ts |
| F15 | Viewer opens Connections, Sources, Run configs, and the Google start URL | Can look, cannot change, direct URLs bounce | phase2-3.spec.ts |
| F16 | Delete run config and sources, then remove the connections | Allowed once nothing depends on them | phase2-3.spec.ts |
| F17 | A connection needs attention | Overview banner appears; a passing Test clears it | phase2-3.spec.ts |
| V1 | Every page at phone and desktop widths, light and dark | No console errors, no horizontal overflow, no axe WCAG A/AA violations; screenshots saved | visual.spec.ts |

## Not yet automatable (arrive with later phases)
Runs and retry, review queue, manual bills, reports, trends,
search, exports, recipients, templates, composer, sending (including a Member without `reports.send` calling the
endpoint directly), sent log, org deletion.

## Manual checks that need real Google
Real Google sign-in round trip, Connect Google Drive and Connect Gmail round trips (consent, return, status "working", Test, Reconnect, Remove, token revoked at myaccount.google.com/permissions), the source tester against a real Gmail and a real IMAP mailbox, and rejection of a real non-allowlisted account. See `docs/setup-guide.md`.
