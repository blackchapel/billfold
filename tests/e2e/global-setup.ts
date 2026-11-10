import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import postgres from "postgres";

export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/billfold_test";
  if (/supabase\.co|amazonaws|neon\.tech/.test(url)) throw new Error("Refusing to run e2e tests against a hosted database");
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.execute(sql`truncate table audit_logs, org_invites, org_members, org_keys, orgs, users, platform_allowlist, rate_limits restart identity cascade`);
  await client.end();
}
