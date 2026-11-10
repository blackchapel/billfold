import { and, asc, eq } from "drizzle-orm";
import type { ConnectionRepository } from "@/domain/ports/repositories";
import type { ConnectionRecord, NewConnection } from "@/domain/ports/records";
import type { ConnectionKind, ConnectionStatus } from "@/domain/value-objects/connection";
import type { Db } from "../db/create";
import { connections } from "../db/schema";

/** Deliberately omits secret_ciphertext: it is only ever read through findSecret. */
const toRecord = (r: typeof connections.$inferSelect): ConnectionRecord => ({
  id: r.id, orgId: r.orgId, kind: r.kind as ConnectionKind, label: r.label, accountEmail: r.accountEmail,
  config: r.config, status: r.status as ConnectionStatus, lastCheckedAt: r.lastCheckedAt, lastError: r.lastError, createdAt: r.createdAt,
});

export class DrizzleConnectionRepository implements ConnectionRepository {
  constructor(private readonly db: Db) {}

  async create(c: NewConnection) {
    const [row] = await this.db.insert(connections).values(c).returning();
    if (!row) throw new Error("Connection insert returned no row");
    return toRecord(row);
  }

  async list(orgId: string) {
    return (await this.db.select().from(connections).where(eq(connections.orgId, orgId)).orderBy(asc(connections.kind), asc(connections.label))).map(toRecord);
  }

  async find(orgId: string, id: string) {
    const [row] = await this.db.select().from(connections).where(and(eq(connections.orgId, orgId), eq(connections.id, id))).limit(1);
    return row ? toRecord(row) : null;
  }

  async findByAccount(orgId: string, kind: ConnectionKind, accountEmail: string) {
    const [row] = await this.db.select().from(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.kind, kind), eq(connections.accountEmail, accountEmail))).limit(1);
    return row ? toRecord(row) : null;
  }

  async findSecret(orgId: string, id: string) {
    const [row] = await this.db.select({ s: connections.secretCiphertext }).from(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.id, id))).limit(1);
    return row?.s ?? null;
  }

  async replaceSecret(orgId: string, id: string, secretCiphertext: string) {
    await this.db.update(connections).set({ secretCiphertext, status: "active", lastError: null })
      .where(and(eq(connections.orgId, orgId), eq(connections.id, id)));
  }

  async recordCheck(orgId: string, id: string, result: { status: ConnectionStatus; error: string | null; at: Date }) {
    await this.db.update(connections).set({ status: result.status, lastError: result.error, lastCheckedAt: result.at })
      .where(and(eq(connections.orgId, orgId), eq(connections.id, id)));
  }

  async remove(orgId: string, id: string) {
    await this.db.delete(connections).where(and(eq(connections.orgId, orgId), eq(connections.id, id)));
  }
}
