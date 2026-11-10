# 0012 Speed: connections, queries and instant feedback

**Context.** Pressing "New source", "Add a bill" and similar buttons sometimes seemed to do nothing until the page was reloaded, and pages felt slow. Measuring a page showed why, on both the server and the browser side.

**What was wrong.**
- **One database connection per server instance** (`createDb(url, max = 1)` was the default in production). Every query of every request that instance handled waited in a single line, so the "parallel" queries on a page ran one after another, simultaneous requests blocked each other, and one stalled socket froze everything until it timed out. A reload hit a fresh connection, which is why it "fixed" it.
- **Many small waste queries per page view**: 5 to 16 statements per page. The organisation was looked up twice (once for the page, once for the switcher), the list of connections was loaded up to three times on the Overview (with their sealed secrets), a `users` row was rewritten on every click to remember the last organisation, and every request asked the auth provider over the network to confirm the sign-in twice.
- **Loading everything to count something**: the Bills page loaded all bills twice, Reports and the Send page loaded every bill ever filed (with their files), and the sent-email list loaded each email's whole HTML.
- **No feedback on in-page links**: the loading screen sits one level up, so pressing a link to a sibling page changed nothing on screen until the server answered; the buttons showed no sign of having been pressed.

**Decisions.**
- Four connections per instance (`POOL_SIZE` in `infra/db/client.ts`); keep instances x 4 well below the Supabase session pooler's slots.
- `auth.getClaims()` instead of `getUser()` in the proxy and in `authGateway.identity()`: the token is verified on the server (no round trip) when the project uses asymmetric signing keys, and falls back to asking Supabase when it does not, so it is never weaker than before. A token revoked on another device stays valid here until it expires (up to an hour), but the allowlist and membership are still checked on every request.
- One membership query per request serves the organisation being opened, the switcher and the permissions, and runs in parallel with the allowlist check (`loadOrg` in `http/session.ts`). The "last organisation" write only touches the row when the value changed.
- Counting and listing months is done by the database (`BillRepository.summary`), reports read only their 12-month window plus every unpaid and every flagged bill (`reportRows`, same output as before, tested), run pages load only the bills their items point at (`findMany`), and listings never select sealed secrets or email bodies. Two partial indexes (migration `0007`) match these queries.
- A per-render memo (`queries/request-memo.ts`) makes connections, sources and run configurations load once per page render.
- **Frontend:** every section and every sub-page has its own `loading.tsx` (a skeleton) so something appears the instant a link is pressed; `LinkButton` and `TextLink` show a spinner while their page opens and, after six seconds, say that it is still loading and to reload; tabs show the same spinner. The skeleton shimmers with one band moved by `transform` only (one animation per skeleton, never per block), which the browser runs on the graphics card; people who ask for less motion get a still skeleton.

**Measured** (local, test mode, statements per page view): Overview 16 -> 9, a form page (New source) 6 -> 3, Bills 9 -> 5, Reports 7 -> 4 (see the PR for the table). Supabase round trips for sign-in checks go from two per request to none when the project signs with asymmetric keys.

**Not done (yet).** A shared cache (Redis) is still planned on top of this; with the version-tag invalidation plan agreed in chat. This work does not need it.

**Consequences.** If Supabase is still on the legacy shared-secret JWT setup, `getClaims()` quietly behaves like `getUser()`: nothing breaks, but the saving needs the asymmetric signing keys (Supabase > Project Settings > JWT Keys).
