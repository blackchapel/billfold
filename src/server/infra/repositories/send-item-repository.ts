import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import type { SendItemRepository } from "@/domain/ports/repositories";
import type { SendItemRecord, SendItemStatus } from "@/domain/ports/records";
import type { Db } from "../db/create";
import { sendItems } from "../db/schema";

const toItem = (r: typeof sendItems.$inferSelect): SendItemRecord => ({
  id: r.id, sendId: r.sendId, orgId: r.orgId, recipientName: r.recipientName, recipientEmail: r.recipientEmail,
  status: r.status as SendItemStatus, error: r.error, attempts: r.attempts, sentAt: r.sentAt,
});

export class DrizzleSendItemRepository implements SendItemRepository {
  constructor(private readonly db: Db) {}

  async insertMany(orgId: string, sendId: string, items: { recipientName: string; recipientEmail: string }[]) {
    if (items.length === 0) return;
    await this.db.insert(sendItems).values(items.map((i) => ({ orgId, sendId, ...i }))).onConflictDoNothing();
  }

  async list(orgId: string, sendId: string) {
    return (await this.db.select().from(sendItems).where(and(eq(sendItems.orgId, orgId), eq(sendItems.sendId, sendId))).orderBy(asc(sendItems.recipientName), asc(sendItems.id))).map(toItem);
  }

  async find(orgId: string, id: string) {
    const [row] = await this.db.select().from(sendItems).where(and(eq(sendItems.orgId, orgId), eq(sendItems.id, id))).limit(1);
    return row ? toItem(row) : null;
  }

  async claimNext(orgId: string, sendId: string, staleBefore: Date) {
    return this.db.transaction(async (tx) => {
      // SKIP LOCKED: two requests at once take different recipients, so nobody is emailed twice.
      const [next] = await tx.select({ id: sendItems.id }).from(sendItems)
        .where(and(eq(sendItems.orgId, orgId), eq(sendItems.sendId, sendId),
          or(eq(sendItems.status, "pending"), and(eq(sendItems.status, "processing"), lt(sendItems.claimedAt, staleBefore)))))
        .orderBy(asc(sendItems.createdAt), asc(sendItems.id)).limit(1).for("update", { skipLocked: true });
      if (!next) return null;
      const [row] = await tx.update(sendItems).set({ status: "processing", claimedAt: new Date(), attempts: sql`${sendItems.attempts} + 1` }).where(eq(sendItems.id, next.id)).returning();
      return row ? toItem(row) : null;
    });
  }

  async markSent(orgId: string, id: string, at: Date) {
    await this.db.update(sendItems).set({ status: "sent", sentAt: at, error: null, claimedAt: null }).where(and(eq(sendItems.orgId, orgId), eq(sendItems.id, id)));
  }

  async markFailed(orgId: string, id: string, error: string) {
    await this.db.update(sendItems).set({ status: "failed", error, claimedAt: null }).where(and(eq(sendItems.orgId, orgId), eq(sendItems.id, id)));
  }

  async retryFailed(orgId: string, sendId: string, maxAttempts: number, itemId: string | null) {
    const rows = await this.db.update(sendItems).set({ status: "pending", error: null, claimedAt: null })
      .where(and(eq(sendItems.orgId, orgId), eq(sendItems.sendId, sendId), eq(sendItems.status, "failed"), lt(sendItems.attempts, maxAttempts), itemId ? eq(sendItems.id, itemId) : undefined))
      .returning({ id: sendItems.id });
    return rows.length;
  }

  async skipPending(orgId: string, sendId: string, note: string) {
    const rows = await this.db.update(sendItems).set({ status: "skipped", error: note })
      .where(and(eq(sendItems.orgId, orgId), eq(sendItems.sendId, sendId), eq(sendItems.status, "pending"))).returning({ id: sendItems.id });
    return rows.length;
  }
}
