import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { BillRepository } from "@/domain/ports/repositories";
import type { BillFilter, BillPatch, BillRecord, NewBill, NewBillFile } from "@/domain/ports/records";
import type { Confidence } from "@/domain/value-objects/bill-data";
import type { Db } from "../db/create";
import { billFiles, bills } from "../db/schema";

type BillRow = typeof bills.$inferSelect;
type FileRow = typeof billFiles.$inferSelect;

const toFile = (f: FileRow) => ({
  id: f.id, driveConnectionId: f.driveConnectionId, driveAccount: f.driveAccount, driveFileId: f.driveFileId, driveFolderId: f.driveFolderId,
  webViewLink: f.webViewLink, name: f.name, mimeType: f.mimeType, sizeBytes: f.sizeBytes, sha256: f.sha256,
});

const toBill = (b: BillRow, files: FileRow[]): BillRecord => ({
  id: b.id, orgId: b.orgId, periodKey: b.periodKey, sourceId: b.sourceId, sourceName: b.sourceName, billerName: b.billerName,
  amountMinor: b.amountMinor, currency: b.currency, billDate: b.billDate, dueDate: b.dueDate, confidence: b.confidence as Confidence,
  method: b.method as BillRecord["method"], needsReview: b.needsReview, note: b.note, messageKey: b.messageKey,
  reviewedAt: b.reviewedAt, paidAt: b.paidAt, deletedAt: b.deletedAt, createdAt: b.createdAt, files: files.map(toFile),
});

/** `%` and `_` in what someone types must match themselves, not act as wildcards. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export class DrizzleBillRepository implements BillRepository {
  constructor(private readonly db: Db) {}

  private async withFiles(rows: BillRow[], orgId: string): Promise<BillRecord[]> {
    if (rows.length === 0) return [];
    const files = await this.db.select().from(billFiles).where(and(eq(billFiles.orgId, orgId), inArray(billFiles.billId, rows.map((r) => r.id))));
    return rows.map((b) => toBill(b, files.filter((f) => f.billId === b.id)));
  }

  async existingKeys(orgId: string, keys: string[]) {
    const found = new Set<string>();
    for (let i = 0; i < keys.length; i += 500) {
      const rows = await this.db.select({ k: bills.messageKey }).from(bills).where(and(eq(bills.orgId, orgId), inArray(bills.messageKey, keys.slice(i, i + 500))));
      for (const r of rows) found.add(r.k);
    }
    return found;
  }

  async record(orgId: string, bill: NewBill, file: NewBillFile) {
    return this.db.transaction(async (tx) => {
      const [b] = await tx.insert(bills).values({ orgId, ...bill }).returning();
      if (!b) throw new Error("Bill insert returned no row");
      const [f] = await tx.insert(billFiles).values({ orgId, billId: b.id, ...file }).returning();
      if (!f) throw new Error("Bill file insert returned no row");
      return toBill(b, [f]);
    });
  }

  async createManual(orgId: string, bill: NewBill) {
    const [b] = await this.db.insert(bills).values({ orgId, ...bill }).returning();
    if (!b) throw new Error("Bill insert returned no row");
    return toBill(b, []);
  }

  async find(orgId: string, id: string) {
    const [row] = await this.db.select().from(bills).where(and(eq(bills.orgId, orgId), eq(bills.id, id))).limit(1);
    return row ? (await this.withFiles([row], orgId))[0] ?? null : null;
  }

  async list(orgId: string, f: BillFilter) {
    const search = f.search?.trim();
    const rows = await this.db.select().from(bills).where(and(
      eq(bills.orgId, orgId),
      f.periodKey ? eq(bills.periodKey, f.periodKey) : undefined,
      f.fromPeriod ? gte(bills.periodKey, f.fromPeriod) : undefined,
      f.toPeriod ? lte(bills.periodKey, f.toPeriod) : undefined,
      f.needsReview ? eq(bills.needsReview, true) : undefined,
      f.unpaid ? isNull(bills.paidAt) : undefined,
      search ? or(ilike(bills.billerName, likePattern(search)), ilike(bills.sourceName, likePattern(search))) : undefined,
      f.deleted === "only" ? isNotNull(bills.deletedAt) : isNull(bills.deletedAt),
    )).orderBy(desc(bills.periodKey), asc(bills.billerName), desc(bills.createdAt));
    return this.withFiles(rows, orgId);
  }

  async findMany(orgId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await this.db.select().from(bills).where(and(eq(bills.orgId, orgId), inArray(bills.id, ids)));
    return this.withFiles(rows, orgId);
  }

  async summary(orgId: string) {
    const rows = await this.db.select({ period: bills.periodKey, review: sql<number>`(count(*) filter (where ${bills.needsReview}))::int` })
      .from(bills).where(and(eq(bills.orgId, orgId), isNull(bills.deletedAt))).groupBy(bills.periodKey).orderBy(desc(bills.periodKey));
    return { months: rows.map((r) => r.period), needsReviewCount: rows.reduce((t, r) => t + r.review, 0) };
  }

  async reportRows(orgId: string, fromPeriod: string) {
    const rows = await this.db.select().from(bills).where(and(
      eq(bills.orgId, orgId), isNull(bills.deletedAt),
      or(gte(bills.periodKey, fromPeriod), isNull(bills.paidAt), eq(bills.needsReview, true)),
    ));
    return rows.map((b) => toBill(b, []));
  }

  async findFiles(orgId: string, fileIds: string[]) {
    if (fileIds.length === 0) return [];
    return (await this.db.select().from(billFiles).where(and(eq(billFiles.orgId, orgId), inArray(billFiles.id, fileIds)))).map(toFile);
  }

  async update(orgId: string, id: string, patch: BillPatch) {
    // Drop absent keys so "not mentioned" never means "set to null".
    const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as BillPatch;
    const [row] = await this.db.update(bills).set(set).where(and(eq(bills.orgId, orgId), eq(bills.id, id))).returning();
    return row ? (await this.withFiles([row], orgId))[0] ?? null : null;
  }
}
