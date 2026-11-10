import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDb } from "@/server/infra/db/create";

export const TEST_DB_URL = process.env.TEST_DATABASE_URL;

export async function prepareDb() {
  if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is not set");
  const client = postgres(TEST_DB_URL, { max: 1, prepare: false });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
  const db = createDb(TEST_DB_URL, 4);
  await resetDb(db);
  return db;
}

export async function resetDb(db: ReturnType<typeof createDb>) {
  await db.execute(sql`truncate table audit_logs, org_invites, org_members, org_keys, orgs, users, platform_allowlist, rate_limits restart identity cascade`);
}
