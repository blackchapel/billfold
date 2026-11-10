-- Seed reference data.
INSERT INTO "currencies" ("code", "minor_units", "symbol", "name") VALUES ('INR', 2, '₹', 'Indian Rupee')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint

-- Deny-by-default: enable RLS on every table in public and add no policies, so the public
-- Supabase anon/authenticated roles can read and write nothing. The server connects with the
-- database owner role (Drizzle), which bypasses RLS. Org scoping is enforced in repositories.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\_\_drizzle%' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
--> statement-breakpoint

-- Belt and braces: also remove table privileges from the Supabase API roles where they exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
  END IF;
END $$;
