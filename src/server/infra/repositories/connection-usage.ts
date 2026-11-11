import { and, eq } from "drizzle-orm";
import type { ConnectionUsage } from "@/domain/ports/repositories";
import type { Db } from "../db/create";
import { runConfigs, sources } from "../db/schema";

export class DrizzleConnectionUsage implements ConnectionUsage {
  constructor(private readonly db: Db) {}

  async namesUsing(orgId: string, connectionId: string) {
    const [s, r] = await Promise.all([
      this.db.select({ name: sources.name }).from(sources).where(and(eq(sources.orgId, orgId), eq(sources.connectionId, connectionId))),
      this.db.select({ name: runConfigs.name }).from(runConfigs).where(and(eq(runConfigs.orgId, orgId), eq(runConfigs.driveConnectionId, connectionId))),
    ]);
    return [...s.map((x) => `source "${x.name}"`), ...r.map((x) => `run config "${x.name}"`)];
  }
}
