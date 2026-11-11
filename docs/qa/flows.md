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
| F26 | Mark paid / unpaid, delete a bill that came from an email ("don't file it again" in the dialog), run the month again, restore it | "Not paid yet" filter works; the deleted bill's email is skipped with "You deleted this bill…"; Restore brings it back | phase5.spec.ts |
| F27 | Search, month filter, Download CSV (also as someone not signed in) | Filters apply; CSV has the header, plain amounts, a defused formula cell; scoped export; no data without a session | phase5.spec.ts |
| F28 | Open Reports: insights, due lists, month picker, chart hover / focus / table / click a column | Overdue and due-soon bills named with amounts; chart has 12 links, tooltip on hover and focus, 12-row table, columns open that month | phase5.spec.ts |
| F29 | Viewer opens Bills and Reports | Can read, filter and download; no add, edit, paid, delete or check buttons; `/bills/new` bounces | phase5.spec.ts |
| F30 | Add recipients (bad email, duplicate), edit, delete | Typed values survive errors; addresses stored lower-case; duplicate refused | phase6.spec.ts |
| F31 | Templates: standard wording, a mistyped placeholder, new default, edit | Typo named and values kept; default badge moves; built-in can be restored as default | phase6.spec.ts |
| F32 | Send: no sender yet; add SMTP; preview (subject, warning, locked frame); test to yourself; real send to 3 people with one refused; retry | Preview hides when inputs change; test goes only to the owner with `[Test]`; PDFs attached; refused address fails alone with a fixed message; retry sends no duplicates; log and Overview checklist updated | phase6.spec.ts |
| F33 | Cancel a send | Unsent emails skipped, or "Sent" if it finished first | phase6.spec.ts |
| F34 | Viewer opens recipients, templates, send, a sent email, reports | Can read; no forms, delete, send, retry, cancel; `/templates/new` bounces | phase6.spec.ts |
| F35 | Reports to Send link | Opens Send with that month selected | phase6.spec.ts |
| F36 | Signed out: open the front page, read How it works, go to sign-in and its privacy link | Four steps, data paragraph, "invite-only", sign-in notice links to terms and privacy | phase7.spec.ts |
| F37 | Signed out: privacy and terms | All sections present, Google Limited Use statement and policy link, date, "ask the person who invited you" (no broken mailto), pages link to each other and home | phase7.spec.ts |
| F38 | Signed in: Privacy and Terms from the app footer | Both open | phase7.spec.ts |
| F39 | Icons, social image, manifest, robots | Every referenced image is served as PNG, tags present, robots allows only `/`, `/privacy`, `/terms` | phase7.spec.ts |
| F40 | Create an organisation, rename it, try to delete with the wrong address, delete it | Address unchanged after rename; wrong confirmation refused; afterwards gone for its owner; other organisations untouched | phase7.spec.ts |
| F41 | On a deliberately slow server, press New source / New run configuration / Add a bill / New template | A spinner on the button and the page skeleton appear within a moment; the form opens without a reload | phase8.spec.ts |
| F42 | The skeleton while a page loads; again with "reduce motion" on | Exactly one animation, animating only `transform`; none when reduced motion is asked for | phase8.spec.ts |
| F43 | A page that takes 9 seconds | After six seconds it says it is still loading and to reload; then the page opens | phase8.spec.ts |
| F44 | Press five tabs in turn on a slow server | Each shows loading feedback at once and lands on its page | phase8.spec.ts |
| F37b | Fetch /privacy and /terms as a crawler: no cookies, no scripts, no redirects | 200 HTML with the permissions table and Limited Use text, no noindex, robots allows both | phase7.spec.ts |
| F45 | A source with a folder path and file name: typo, slash, live example, save, run, edit | Messages name the mistake; example matches the month; the stand-in Drive received `bills/<MON><yy>` and `phone-bill_xxxx-<Mon><yy>.pdf`; fields come back when editing | phase9.spec.ts |
| F46 | A Drive connected before full access: badge, folder-path run, Reconnect | "needs more permission" shown; the run fails with a clear message and uploads nothing; Reconnect clears the badge | phase9.spec.ts |
| F47 | Add a bill with a document: preview, a disguised file, a 5 MB file, save | Preview shows folder and file name; wrong type refused and typed values kept; too big caught on screen; the document is filed under its own name and the bill links to it | phase9.spec.ts |
| F48 | A change in one session shows in another: recipient added; viewer promoted and demoted | Visible at once after reload; permissions follow the role change at once | phase9.spec.ts |
| F49 | Settings > Cache > Clear the cache (and as a viewer) | Confirmation shown; data still there; viewer has no button | phase9.spec.ts |
| F50 | The test-only endpoints | Answer in test mode (they answer 404 elsewhere) | phase9.spec.ts |
| F52 | Connections > Name on this account; Send > Preview with a closing text using `{{from_name}}` | Bad names refused; the name shows in the preview; clearing it falls back to the sender | phase9.spec.ts |
| F51 | Bills > Delete (typed-in bill, then an emailed bill) | Typed-in bill: one plain delete, Keep leaves it. Emailed bill: two choices; "file it again" removes it for good and the next run files it again | phase9.spec.ts |
| V1 | Every page at phone and desktop widths, light and dark | No console errors, no horizontal overflow, no axe WCAG A/AA violations; screenshots saved | visual.spec.ts |

## Not yet automatable
Transferring ownership through the UI (needs a second member; covered by unit tests). A Member without `reports.send` calling the send actions directly is covered by unit tests (`tests/unit/application/sends.test.ts`).

## Manual checks that need real Google
Real Google sign-in round trip, Connect Google Drive and Connect Gmail round trips (consent, return, status "working", Test, Reconnect, Remove, token revoked at myaccount.google.com/permissions), the source tester and a real run against a real Gmail and a real IMAP mailbox (Gmail API fetch is tested only with a mocked HTTP layer), a real Google Drive upload and download (including full-access folder reuse, Reconnect granting the `drive` scope, and an existing `bills` folder being used), a real Upstash Redis (the cache logic is tested against an in-memory copy and mocked HTTP), Google's verification crawler reading the privacy page, and Gemini (tested only with mocked HTTP), a real send through Gmail (project B, `gmail.send`) and through a real SMTP account: press **Send me a test** on billfold-dev and check the inbox, the attachments open and the table looks right in your mail app (SMTP is tested against a local server and Gmail against mocked HTTP), the Phase 5 screens with a few weeks of real bills (the numbers are covered by unit tests, but only you know what looks right), and rejection of a real non-allowlisted account. See `docs/setup-guide.md`.
