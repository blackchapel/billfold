import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import type { RunItemRepository } from "@/domain/ports/repositories";
import type { NewRunItem, RunItemRecord } from "@/domain/ports/records";
import type { RunItemStatus } from "@/domain/value-objects/bill-data";
import type { Db } from "../db/create";
import { runItems } from "../db/schema";

const toItem = (r: typeof runItems.$inferSelect): RunItemRecord => ({
  id: r.id, runId: r.runId, orgId: r.orgId, sourceId: r.sourceId, sourceName: r.sourceName, messageId: r.messageId,
  messageDate: r.messageDate, fromAddress: r.fromAddress, subject: r.subject, attachmentName: r.attachmentName, itemKey: r.itemKey,
  status: r.status as RunItemStatus, error: r.error, attempts: r.attempts, billId: r.billId,
});

export class DrizzleRunItemRepository implements RunItemRepository {
  constructor(private readonly db: Db) {}

  async insertMany(orgId: string, runId: string, items: NewRunItem[]) {
    if (items.length === 0) return;
    // Postgres caps bind parameters per statement, so insert in slices.
    for (let i = 0; i < items.length; i += 200) {
      await this.db.insert(runItems).values(items.slice(i, i + 200).map((item) => ({ orgId, runId, ...item }))).onConflictDoNothing();
    }
  }

  async list(orgId: string, runId: string) {
    return (await this.db.select().from(runItems).where(and(eq(runItems.orgId, orgId), eq(runItems.runId, runId)))
      .orderBy(asc(runItems.sourceName), asc(runItems.messageDate), asc(runItems.id))).map(toItem);
  }

  async find(orgId: string, id: string) {
    const [row] = await this.db.select().from(runItems).where(and(eq(runItems.orgId, orgId), eq(runItems.id, id))).limit(1);
    return row ? toItem(row) : null;
  }

  async claimNext(orgId: string, runId: string, staleBefore: Date) {
    return this.db.transaction(async (tx) => {
      // SKIP LOCKED: a second request running at the same time takes the next item instead of waiting for, or repeating, this one.
      const [next] = await tx.select({ id: runItems.id }).from(runItems)
        .where(and(eq(runItems.orgId, orgId), eq(runItems.runId, runId),
          or(eq(runItems.status, "pending"), and(eq(runItems.status, "processing"), lt(runItems.claimedAt, staleBefore)))))
        .orderBy(asc(runItems.createdAt), asc(runItems.id)).limit(1).for("update", { skipLocked: true });
      if (!next) return null;
      const [row] = await tx.update(runItems)
        .set({ status: "processing", claimedAt: new Date(), attempts: sql`${runItems.attempts} + 1` })
        .where(eq(runItems.id, next.id)).returning();
      return row ? toItem(row) : null;
    });
  }

  async markDone(orgId: string, id: string, billId: string) {
    await this.db.update(runItems).set({ status: "done", billId, error: null, claimedAt: null }).where(and(eq(runItems.orgId, orgId), eq(runItems.id, id)));
  }

  async markFailed(orgId: string, id: string, error: string) {
    await this.db.update(runItems).set({ status: "failed", error, claimedAt: null }).where(and(eq(runItems.orgId, orgId), eq(runItems.id, id)));
  }

  async retryFailed(orgId: string, runId: string, maxAttempts: number, itemId: string | null) {
    const rows = await this.db.update(runItems).set({ status: "pending", error: null, claimedAt: null })
      .where(and(eq(runItems.orgId, orgId), eq(runItems.runId, runId), eq(runItems.status, "failed"), lt(runItems.attempts, maxAttempts),
        itemId ? eq(runItems.id, itemId) : undefined)).returning({ id: runItems.id });
    return rows.length;
  }

  async skipPending(orgId: string, runId: string, note: string) {
    const rows = await this.db.update(runItems).set({ status: "skipped", error: note })
      .where(and(eq(runItems.orgId, orgId), eq(runItems.runId, runId), eq(runItems.status, "pending"))).returning({ id: runItems.id });
    return rows.length;
  }
}
