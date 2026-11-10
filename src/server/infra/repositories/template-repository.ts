import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { TemplateRepository } from "@/domain/ports/repositories";
import type { TemplateRecord } from "@/domain/ports/records";
import type { Db } from "../db/create";
import { emailTemplates } from "../db/schema";

const toRecord = (r: typeof emailTemplates.$inferSelect): TemplateRecord => ({ id: r.id, orgId: r.orgId, name: r.name, subject: r.subject, intro: r.intro, signoff: r.signoff, isDefault: r.isDefault });

export class DrizzleTemplateRepository implements TemplateRepository {
  constructor(private readonly db: Db) {}

  async create(orgId: string, createdBy: string, fields: { name: string; subject: string; intro: string; signoff: string }) {
    const [row] = await this.db.insert(emailTemplates).values({ orgId, createdBy, ...fields }).returning();
    if (!row) throw new Error("Template insert returned no row");
    return toRecord(row);
  }

  async update(orgId: string, id: string, fields: { name: string; subject: string; intro: string; signoff: string }) {
    const [row] = await this.db.update(emailTemplates).set(fields).where(and(eq(emailTemplates.orgId, orgId), eq(emailTemplates.id, id))).returning();
    return row ? toRecord(row) : null;
  }

  async list(orgId: string) {
    return (await this.db.select().from(emailTemplates).where(eq(emailTemplates.orgId, orgId)).orderBy(asc(emailTemplates.name))).map(toRecord);
  }

  async find(orgId: string, id: string) {
    const [row] = await this.db.select().from(emailTemplates).where(and(eq(emailTemplates.orgId, orgId), eq(emailTemplates.id, id))).limit(1);
    return row ? toRecord(row) : null;
  }

  async findByName(orgId: string, name: string) {
    const [row] = await this.db.select().from(emailTemplates).where(and(eq(emailTemplates.orgId, orgId), sql`lower(${emailTemplates.name}) = lower(${name})`)).limit(1);
    return row ? toRecord(row) : null;
  }

  async setDefault(orgId: string, id: string | null) {
    await this.db.transaction(async (tx) => {
      // Clear first: the partial unique index allows only one default per organisation.
      await tx.update(emailTemplates).set({ isDefault: false }).where(and(eq(emailTemplates.orgId, orgId), id ? ne(emailTemplates.id, id) : undefined));
      if (id) await tx.update(emailTemplates).set({ isDefault: true }).where(and(eq(emailTemplates.orgId, orgId), eq(emailTemplates.id, id)));
    });
  }

  async remove(orgId: string, id: string) {
    await this.db.delete(emailTemplates).where(and(eq(emailTemplates.orgId, orgId), eq(emailTemplates.id, id)));
  }
}
