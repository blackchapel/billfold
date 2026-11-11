# Operations

- **Keep-alive.** `vercel.json` cron calls `/api/health` daily with `Authorization: Bearer $CRON_SECRET`; it runs `select 1` so the
  Supabase free project is not paused. Check Vercel > Cron Jobs if the project ever pauses (Restore it in Supabase).
- **Connection health check.** A second daily cron calls `/api/cron/connections` (same bearer secret). It re-tests every saved connection, oldest first within a 45 s budget, so
  an expired Gmail token or a changed app password shows up as "needs attention" (Connections page and an overview banner) without anyone pressing Test.
  It only reads; it never sends mail or touches Drive files. Hobby plans allow two daily crons, which is exactly what is used.
- **Migrations.** `pnpm db:generate` after changing `src/server/infra/db/schema`; commit the SQL in `drizzle/`.
  Apply with the **Database migrate** GitHub Action (develop first, then production). New tables must enable RLS
  (copy the pattern in `0001_rls_and_seed.sql`); an integration test fails otherwise.
- **Backups.** Supabase free has no point-in-time backup; export periodically (`pg_dump` from Cloud Shell using the direct string).
- **Rotating secrets.** `CRON_SECRET`: change in Vercel, redeploy. Supabase anon key: rotate in Supabase, update Vercel, redeploy.
  `MASTER_ENCRYPTION_KEY`: see docs/security.md.
- **Runs.** A run page keeps calling the server until every item is filed. If someone closes the tab mid-run, items stay *Waiting* (or *Filing…* for up to 5 minutes if a request died) and the run
  carries on when the page is opened again. `maxDuration` is 60 s on the run pages; one item (download, unlock, read, upload) normally takes a few seconds.
- **Bills and Drive.** The database stores Drive file ids, links and SHA-256 hashes, not the PDFs. If a Drive file is deleted by hand, the bill row stays and its link breaks.
- **Sending.** The send page keeps calling the server until every recipient has been tried, one email per request (`maxDuration` 60 s). Closing the tab leaves the rest *Waiting* (or *Sending…* for up to 5 minutes if a request died); open the send again to carry on. Gmail allows roughly 500 emails a day per account (about 2000 for Workspace),
  far more than a family needs. The mail server accepting a message does not prove it reached the inbox: bounces that arrive later are not visible to Billfold. A test send to yourself is the way to check a new account.
- **Cache.** Upstash free plan, Mumbai. Check Upstash > Usage for the monthly command count (a page view is a handful of commands). If it is full or down, pages simply read the database. If lists look out of date: Settings > Cache > Clear the cache. After editing data directly in Supabase, clear the cache too. Eviction can stay off: entries expire by themselves and are tiny.
- **Google verification.** The privacy and terms URLs must open for anyone without signing in: Vercel Authentication on the `develop` domain blocks Google's crawler (see the setup guide). Test with a private browser window. Gemini stays off unless `GEMINI_NO_TRAINING_CONFIRMED=1`.
- **Speed.** Each server instance keeps four database connections (`POOL_SIZE`); on the Supabase free session pooler keep instances x 4 well under its client limit (check Database > Pooler settings). If pages feel slow, look at Vercel runtime logs for the slow route first, then at Supabase > Reports > Query performance. `auth.getClaims()` verifies sign-in locally only when the project uses asymmetric JWT signing keys: Supabase > Project Settings > JWT Keys.
- **Legal pages.** When the app starts storing or sending something new, update `src/app/(legal)/privacy/page.tsx` and the date in `src/constants/legal.ts` in the same change. Brand PNGs are generated: `PW_CHROMIUM_PATH=... pnpm exec tsx scripts/make-brand-assets.mts`.
- **Migration 0006** (recipients, templates, sends, send items) must be applied with the **Database migrate** workflow on develop, and on production when the phase is promoted.
