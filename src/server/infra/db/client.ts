import "server-only";
import { env } from "../config/env";
import { createDb, type Db } from "./create";

/**
 * Connections each server instance may hold open. It used to be one, which made every query of every request that the instance
 * served wait in a single line, so a page's parallel queries ran one after another and a slow or dead socket stalled everything
 * until it timed out. Four lets a page's queries and a few simultaneous requests run side by side. The Supabase session pooler
 * only has a few dozen slots in total, so keep instances x this number well below that.
 */
const POOL_SIZE = 4;

let instance: Db | null = null;

export function db(): Db {
  if (!instance) instance = createDb(env().DATABASE_URL, POOL_SIZE);
  return instance;
}
