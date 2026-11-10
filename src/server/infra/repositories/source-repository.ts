import { and, asc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { SourceRepository } from "@/domain/ports/repositories";
import type { SourceFields, SourceRecord } from "@/domain/ports/records";
import type { PasswordMode } from "@/domain/value-objects/password-rule";
import type { Db } from "../db/create";
import { sources } from "../db/schema";

/** Deliberately omits password_ciphertext, in the record and in the queries (`safeColumns`): it is only read through findPasswordCiphertext. */
type SafeRow = Omit<typeof sources.$inferSelect, "passwordCiphertext"> & { hasPassword: boolean };
const { passwordCiphertext: _sealed, ...plainColumns } = getTableColumns(sources); // eslint-disable-line @typescript-eslint/no-unused-vars
/** What every read selects: all columns except the sealed password, plus whether there is one. */
const safeColumns = { ...plainColumns, hasPassword: sql<boolean>`${sources.passwordCiphertext} is not null` };
const flag = (r: typeof sources.$inferSelect): SafeRow => ({ ...r, hasPassword: r.passwordCiphertext !== null });
const toRecord = (r: SafeRow): SourceRecord => ({
  id: r.id, orgId: r.orgId, name: r.name, connectionId: r.connectionId,
  matcher: { senders: r.senders, subjectContains: r.subjectContains, attachmentNameContains: r.attachmentNameContains, requireAttachment: r.requireAttachment },
  passwordMode: r.passwordMode as PasswordMode, passwordPattern: r.passwordPattern, hasStaticPassword: r.hasPassword,
  fileNameTemplate: r.fileNameTemplate, folderTemplate: r.folderTemplate, createdAt: r.createdAt,
});

const columns = (f: SourceFields) => ({
  name: f.name, connectionId: f.connectionId, senders: f.matcher.senders, subjectContains: f.matcher.subjectContains,
  attachmentNameContains: f.matcher.attachmentNameContains, requireAttachment: f.matcher.requireAttachment,
  passwordMode: f.passwordMode, passwordPattern: f.passwordPattern, fileNameTemplate: f.fileNameTemplate ?? null, folderTemplate: f.folderTemplate ?? null,
});

export class DrizzleSourceRepository implements SourceRepository {
  constructor(private readonly db: Db) {}

  async create(orgId: string, createdBy: string, fields: SourceFields, passwordCiphertext: string | null) {
    const [row] = await this.db.insert(sources).values({ orgId, createdBy, ...columns(fields), passwordCiphertext }).returning();
    if (!row) throw new Error("Source insert returned no row");
    return toRecord(flag(row));
  }

  async update(orgId: string, id: string, fields: SourceFields, passwordCiphertext: string | null | undefined) {
    const [row] = await this.db.update(sources)
      .set({ ...columns(fields), ...(passwordCiphertext === undefined ? {} : { passwordCiphertext }) })
      .where(and(eq(sources.orgId, orgId), eq(sources.id, id))).returning();
    return row ? toRecord(flag(row)) : null;
  }

  async list(orgId: string) {
    return (await this.db.select(safeColumns).from(sources).where(eq(sources.orgId, orgId)).orderBy(asc(sources.name))).map(toRecord);
  }

  async find(orgId: string, id: string) {
    const [row] = await this.db.select(safeColumns).from(sources).where(and(eq(sources.orgId, orgId), eq(sources.id, id))).limit(1);
    return row ? toRecord(row) : null;
  }

  async findMany(orgId: string, ids: string[]) {
    if (ids.length === 0) return [];
    return (await this.db.select(safeColumns).from(sources).where(and(eq(sources.orgId, orgId), inArray(sources.id, ids)))).map(toRecord);
  }

  async findByName(orgId: string, name: string) {
    const [row] = await this.db.select(safeColumns).from(sources).where(and(eq(sources.orgId, orgId), sql`lower(${sources.name}) = lower(${name})`)).limit(1);
    return row ? toRecord(row) : null;
  }

  async findPasswordCiphertext(orgId: string, id: string) {
    const [row] = await this.db.select({ c: sources.passwordCiphertext }).from(sources).where(and(eq(sources.orgId, orgId), eq(sources.id, id))).limit(1);
    return row?.c ?? null;
  }

  async remove(orgId: string, id: string) {
    await this.db.delete(sources).where(and(eq(sources.orgId, orgId), eq(sources.id, id)));
  }
}
