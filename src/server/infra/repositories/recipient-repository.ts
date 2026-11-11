import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { RecipientRepository } from "@/domain/ports/repositories";
import type { RecipientRecord } from "@/domain/ports/records";
import type { Db } from "../db/create";
import { recipients } from "../db/schema";

const toRecord = (r: typeof recipients.$inferSelect): RecipientRecord => ({ id: r.id, orgId: r.orgId, name: r.name, email: r.email, createdAt: r.createdAt });

export class DrizzleRecipientRepository implements RecipientRepository {
  constructor(private readonly db: Db) {}

  async create(orgId: string, createdBy: string, fields: { name: string; email: string }) {
    const [row] = await this.db.insert(recipients).values({ orgId, createdBy, ...fields }).returning();
    if (!row) throw new Error("Recipient insert returned no row");
    return toRecord(row);
  }

  async update(orgId: string, id: string, fields: { name: string; email: string }) {
    const [row] = await this.db.update(recipients).set(fields).where(and(eq(recipients.orgId, orgId), eq(recipients.id, id))).returning();
    return row ? toRecord(row) : null;
  }

  async list(orgId: string) {
    return (await this.db.select().from(recipients).where(eq(recipients.orgId, orgId)).orderBy(asc(recipients.name))).map(toRecord);
  }

  async find(orgId: string, id: string) {
    const [row] = await this.db.select().from(recipients).where(and(eq(recipients.orgId, orgId), eq(recipients.id, id))).limit(1);
    return row ? toRecord(row) : null;
  }

  async findByEmail(orgId: string, email: string) {
    const [row] = await this.db.select().from(recipients).where(and(eq(recipients.orgId, orgId), sql`lower(${recipients.email}) = lower(${email})`)).limit(1);
    return row ? toRecord(row) : null;
  }

  async findMany(orgId: string, ids: string[]) {
    if (ids.length === 0) return [];
    return (await this.db.select().from(recipients).where(and(eq(recipients.orgId, orgId), inArray(recipients.id, ids))).orderBy(asc(recipients.name))).map(toRecord);
  }

  async remove(orgId: string, id: string) {
    await this.db.delete(recipients).where(and(eq(recipients.orgId, orgId), eq(recipients.id, id)));
  }
}
