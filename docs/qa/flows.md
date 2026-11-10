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
| F18 | Click every tab several times, rapidly, then back and forward | Each click lands on the right page, current tab highlighted | phase4.spec.ts |
| F19 | Rename the organisation | New name shows at once in header and sidebar without a reload | phase4.spec.ts |
| F20 | Overview before any run | Getting-started checklist, no "Latest run" | phase4.spec.ts |
| F21 | Run a month with a Jio-style locked PDF, a static-password bank PDF (one source with a wrong password), a plain PDF and a bill that is the email body; retry after fixing; run again | Amounts read, Drive links shown, passwords never on the page, wrong password explained and retried, second run skips everything | phase4.spec.ts |
| F22 | Pause and cancel a run | Filed items stay, the rest skipped with a reason | phase4.spec.ts |
| F23 | Viewer opens runs | Can read, no start/retry/cancel/pause | phase4.spec.ts |
| F24 | A scan with no readable text is filed; open Bills from the Overview notice; correct it (with a typo first) and tick "checked" | Flagged on Overview and in Bills; typed values survive the error; after saving the flag and notices are gone | phase5.spec.ts |
| F25 | Add a bill by hand (a bad amount first) | Typed values kept after the error; bill listed as "added by hand"; the month list starts at the current month | phase5.spec.ts |
| F26 | Mark paid / unpaid, delete a bill that came from an email, run the month again, restore it | "Not paid yet" filter works; the deleted bill's email is not filed again; Restore brings it back | phase5.spec.ts |
| F27 | Search, month filter, Download CSV (also as someone not signed in) | Filters apply; CSV has the header, plain amounts, a defused formula cell; scoped export; no data without a session | phase5.spec.ts |
| F28 | Open Reports: insights, due lists, month picker, chart hover / focus / table / click a column | Overdue and due-soon bills named with amounts; chart has 12 links, tooltip on hover and focus, 12-row table, columns open that month | phase5.spec.ts |
| F29 | Viewer opens Bills and Reports | Can read, filter and download; no add, edit, paid, delete or check buttons; `/bills/new` bounces | phase5.spec.ts |
| V1 | Every page at phone and desktop widths, light and dark | No console errors, no horizontal overflow, no axe WCAG A/AA violations; screenshots saved | visual.spec.ts |

## Not yet automatable (arrive with later phases)
Reports sent by email, trends,
search, exports, recipients, templates, composer, sending (including a Member without `reports.send` calling the
endpoint directly), sent log, org deletion.

## Manual checks that need real Google
Real Google sign-in round trip, Connect Google Drive and Connect Gmail round trips (consent, return, status "working", Test, Reconnect, Remove, token revoked at myaccount.google.com/permissions), the source tester and a real run against a real Gmail and a real IMAP mailbox (Gmail API fetch is tested only with a mocked HTTP layer), a real Google Drive upload and Gemini (both tested only with mocked HTTP), the Phase 5 screens with a few weeks of real bills (the numbers are covered by unit tests, but only you know what looks right), and rejection of a real non-allowlisted account. See `docs/setup-guide.md`.
