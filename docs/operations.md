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
