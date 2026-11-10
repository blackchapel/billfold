import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { BillRepository } from "@/domain/ports/repositories";
import type { BillRecord, NewBill, NewBillFile } from "@/domain/ports/records";
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
  method: b.method as "text" | "gemini", needsReview: b.needsReview, note: b.note, messageKey: b.messageKey, createdAt: b.createdAt,
  files: files.map(toFile),
});

export class DrizzleBillRepository implements BillRepository {
  constructor(private readonly db: Db) {}

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

  async list(orgId: string, periodKey: string | null) {
    const rows = await this.db.select().from(bills).where(and(eq(bills.orgId, orgId), periodKey ? eq(bills.periodKey, periodKey) : undefined))
      .orderBy(desc(bills.periodKey), asc(bills.sourceName), desc(bills.createdAt));
    if (rows.length === 0) return [];
    const files = await this.db.select().from(billFiles).where(and(eq(billFiles.orgId, orgId), inArray(billFiles.billId, rows.map((r) => r.id))));
    return rows.map((b) => toBill(b, files.filter((f) => f.billId === b.id)));
  }
}
