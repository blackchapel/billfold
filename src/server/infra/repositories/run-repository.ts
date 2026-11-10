import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { RunRepository } from "@/domain/ports/repositories";
import type { RunCounts, RunRecord } from "@/domain/ports/records";
import type { RunStatus } from "@/domain/value-objects/bill-data";
import type { Db } from "../db/create";
import { runItems, runs } from "../db/schema";

const toRun = (r: typeof runs.$inferSelect): RunRecord => ({
  id: r.id, orgId: r.orgId, runConfigId: r.runConfigId, configName: r.configName, periodKey: r.periodKey,
  status: r.status as RunStatus, startedBy: r.startedBy, createdAt: r.createdAt, finishedAt: r.finishedAt,
});

export class DrizzleRunRepository implements RunRepository {
  constructor(private readonly db: Db) {}

  async create(orgId: string, run: { runConfigId: string; configName: string; periodKey: string; startedBy: string }) {
    const [row] = await this.db.insert(runs).values({ orgId, ...run }).returning();
    if (!row) throw new Error("Run insert returned no row");
    return toRun(row);
  }

  async find(orgId: string, id: string) {
    const [row] = await this.db.select().from(runs).where(and(eq(runs.orgId, orgId), eq(runs.id, id))).limit(1);
    return row ? toRun(row) : null;
  }

  async list(orgId: string, limit: number) {
    return (await this.db.select().from(runs).where(eq(runs.orgId, orgId)).orderBy(desc(runs.createdAt)).limit(limit)).map(toRun);
  }

  async setStatus(orgId: string, id: string, status: RunStatus, finishedAt: Date | null) {
    await this.db.update(runs).set({ status, finishedAt }).where(and(eq(runs.orgId, orgId), eq(runs.id, id)));
  }

  async counts(orgId: string, runIds: string[]) {
    const out = new Map<string, RunCounts>();
    if (runIds.length === 0) return out;
    const rows = await this.db.select({ runId: runItems.runId, status: runItems.status, n: count() }).from(runItems)
      .where(and(eq(runItems.orgId, orgId), inArray(runItems.runId, runIds))).groupBy(runItems.runId, runItems.status);
    for (const id of runIds) out.set(id, { pending: 0, processing: 0, done: 0, failed: 0, skipped: 0 });
    for (const r of rows) {
      const c = out.get(r.runId);
      if (c && r.status in c) c[r.status as keyof RunCounts] = r.n;
    }
    return out;
  }
}
