import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import type { SendRepository } from "@/domain/ports/repositories";
import type { NewSend, SendCounts, SendRecord, SendStatus } from "@/domain/ports/records";
import type { Db } from "../db/create";
import { sendItems, sends } from "../db/schema";

const toSend = (r: typeof sends.$inferSelect): SendRecord => ({
  id: r.id, orgId: r.orgId, periodKey: r.periodKey, templateName: r.templateName, subject: r.subject, bodyHtml: r.bodyHtml, bodyText: r.bodyText,
  fromConnectionId: r.fromConnectionId, fromAccount: r.fromAccount, attachmentFileIds: r.attachmentFileIds, attachmentBytes: r.attachmentBytes,
  billCount: r.billCount, totalMinor: r.totalMinor, isTest: r.isTest, status: r.status as SendStatus, createdBy: r.createdBy, createdAt: r.createdAt, finishedAt: r.finishedAt,
});

export class DrizzleSendRepository implements SendRepository {
  constructor(private readonly db: Db) {}

  async create(orgId: string, send: NewSend) {
    const [row] = await this.db.insert(sends).values({ orgId, ...send }).returning();
    if (!row) throw new Error("Send insert returned no row");
    return toSend(row);
  }

  async find(orgId: string, id: string) {
    const [row] = await this.db.select().from(sends).where(and(eq(sends.orgId, orgId), eq(sends.id, id))).limit(1);
    return row ? toSend(row) : null;
  }

  async list(orgId: string, limit: number) {
    return (await this.db.select().from(sends).where(eq(sends.orgId, orgId)).orderBy(desc(sends.createdAt)).limit(limit)).map(toSend);
  }

  async setStatus(orgId: string, id: string, status: SendStatus, finishedAt: Date | null) {
    await this.db.update(sends).set({ status, finishedAt }).where(and(eq(sends.orgId, orgId), eq(sends.id, id)));
  }

  async counts(orgId: string, sendIds: string[]) {
    const out = new Map<string, SendCounts>();
    if (sendIds.length === 0) return out;
    const rows = await this.db.select({ sendId: sendItems.sendId, status: sendItems.status, n: count() }).from(sendItems)
      .where(and(eq(sendItems.orgId, orgId), inArray(sendItems.sendId, sendIds))).groupBy(sendItems.sendId, sendItems.status);
    for (const id of sendIds) out.set(id, { pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 });
    for (const r of rows) {
      const c = out.get(r.sendId);
      if (c && r.status in c) c[r.status as keyof SendCounts] = r.n;
    }
    return out;
  }

  async countSince(orgId: string, userId: string, since: Date) {
    const [row] = await this.db.select({ n: count() }).from(sends).where(and(eq(sends.orgId, orgId), eq(sends.createdBy, userId), gte(sends.createdAt, since)));
    return row?.n ?? 0;
  }
}
