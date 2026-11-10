import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../infra/db/client";

export async function pingDatabase(): Promise<void> {
  await db().execute(sql`select 1`);
}
