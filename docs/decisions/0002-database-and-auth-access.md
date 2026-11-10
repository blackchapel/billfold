# 0002 Server-side Postgres via Drizzle; Supabase for Auth only
**Context.** Supabase offers a client that talks to Postgres through its API and RLS.
**Decision.** The browser never queries the database. Supabase Auth handles Google sign-in; all data access is server-side
Drizzle over the transaction pooler (`prepare: false`). RLS is enabled with no policies as a backstop.
**Alternatives.** Supabase client + RLS policies per table (policy sprawl, harder org-scoping tests).
**Consequences.** Authorisation lives in code we can unit-test. The anon key is useless to an attacker.
