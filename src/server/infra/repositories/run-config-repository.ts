import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { RunConfigRepository } from "@/domain/ports/repositories";
import type { RunConfigFields, RunConfigRecord } from "@/domain/ports/records";
import type { PeriodMode } from "@/domain/value-objects/period";
import type { Db } from "../db/create";
import { runConfigSources, runConfigs } from "../db/schema";

const toRecord = (r: typeof runConfigs.$inferSelect, sourceIds: string[]): RunConfigRecord => ({
  id: r.id, orgId: r.orgId, name: r.name, driveConnectionId: r.driveConnectionId, driveFolder: r.driveFolder,
  periodMode: r.periodMode as PeriodMode, sourceIds, createdAt: r.createdAt,
});

export class DrizzleRunConfigRepository implements RunConfigRepository {
  constructor(private readonly db: Db) {}

  private async sourceIdsFor(ids: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (ids.length === 0) return map;
    const rows = await this.db.select().from(runConfigSources).where(inArray(runConfigSources.runConfigId, ids));
    for (const r of rows) map.set(r.runConfigId, [...(map.get(r.runConfigId) ?? []), r.sourceId]);
    return map;
  }

  async create(orgId: string, createdBy: string, f: RunConfigFields) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(runConfigs).values({ orgId, createdBy, name: f.name, driveConnectionId: f.driveConnectionId, driveFolder: f.driveFolder, periodMode: f.periodMode }).returning();
      if (!row) throw new Error("Run config insert returned no row");
      await tx.insert(runConfigSources).values(f.sourceIds.map((sourceId) => ({ runConfigId: row.id, sourceId })));
      return toRecord(row, f.sourceIds);
    });
  }

  async update(orgId: string, id: string, f: RunConfigFields) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.update(runConfigs)
        .set({ name: f.name, driveConnectionId: f.driveConnectionId, driveFolder: f.driveFolder, periodMode: f.periodMode })
        .where(and(eq(runConfigs.orgId, orgId), eq(runConfigs.id, id))).returning();
      if (!row) return null;
      await tx.delete(runConfigSources).where(eq(runConfigSources.runConfigId, id));
      await tx.insert(runConfigSources).values(f.sourceIds.map((sourceId) => ({ runConfigId: id, sourceId })));
      return toRecord(row, f.sourceIds);
    });
  }

  async list(orgId: string) {
    const rows = await this.db.select().from(runConfigs).where(eq(runConfigs.orgId, orgId)).orderBy(asc(runConfigs.name));
    const links = await this.sourceIdsFor(rows.map((r) => r.id));
    return rows.map((r) => toRecord(r, links.get(r.id) ?? []));
  }

  async find(orgId: string, id: string) {
    const [row] = await this.db.select().from(runConfigs).where(and(eq(runConfigs.orgId, orgId), eq(runConfigs.id, id))).limit(1);
    return row ? toRecord(row, (await this.sourceIdsFor([row.id])).get(row.id) ?? []) : null;
  }

  async findByName(orgId: string, name: string) {
    const [row] = await this.db.select().from(runConfigs).where(and(eq(runConfigs.orgId, orgId), sql`lower(${runConfigs.name}) = lower(${name})`)).limit(1);
    return row ? toRecord(row, (await this.sourceIdsFor([row.id])).get(row.id) ?? []) : null;
  }

  async remove(orgId: string, id: string) {
    await this.db.delete(runConfigs).where(and(eq(runConfigs.orgId, orgId), eq(runConfigs.id, id)));
  }
}
