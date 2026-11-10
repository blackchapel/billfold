import { sql } from "drizzle-orm";
import type { RateLimiter } from "@/domain/ports/services";
import type { Db } from "../db/create";
import { rateLimits } from "../db/schema";

/** Fixed-window limiter stored in Postgres (no extra service needed on free tiers). */
export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly db: Db) {}

  async allow(key: string, limit: number, windowSeconds: number) {
    const [row] = await this.db.insert(rateLimits).values({ key, windowStart: new Date(), count: 1 }).onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} < now() - (${windowSeconds} || ' seconds')::interval then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} < now() - (${windowSeconds} || ' seconds')::interval then now() else ${rateLimits.windowStart} end`,
      },
    }).returning({ count: rateLimits.count });
    return (row?.count ?? 1) <= limit;
  }
}
