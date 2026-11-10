import "server-only";
import { env } from "../config/env";
import { createDb, type Db } from "./create";

let instance: Db | null = null;

export function db(): Db {
  if (!instance) instance = createDb(env().DATABASE_URL);
  return instance;
}
