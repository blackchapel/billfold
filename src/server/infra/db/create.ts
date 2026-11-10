import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export function createDb(url: string, max = 1) {
  // Supabase pooler (transaction mode) does not support prepared statements.
  // Serverless instances are frozen between requests, so the pooler may drop idle sockets without telling us.
  // Short idle/lifetime/connect timeouts make a dead socket fail fast and get replaced instead of hanging a request.
  const client = postgres(url, { prepare: false, max, connect_timeout: 10, idle_timeout: 10, max_lifetime: 120 });
  return drizzle(client, { schema });
}
