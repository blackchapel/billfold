import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export function createDb(url: string, max = 1) {
  // Supabase pooler (transaction mode) does not support prepared statements.
  const client = postgres(url, { prepare: false, max });
  return drizzle(client, { schema });
}
