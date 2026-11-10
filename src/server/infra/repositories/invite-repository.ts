import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { InviteRepository } from "@/domain/ports/repositories";
import type { InviteRecord } from "@/domain/ports/records";
import type { Role } from "@/domain/policies/permissions";
import type { Db } from "../db/create";
import { orgInvites } from "../db/schema";

const toInvite = (r: typeof orgInvites.$inferSelect): InviteRecord => ({
  id: r.id, orgId: r.orgId, codeHash: r.codeHash, role: r.role as Role, maxUses: r.maxUses,
  useCount: r.useCount, expiresAt: r.expiresAt, revokedAt: r.revokedAt, createdBy: r.createdBy,
});

export class DrizzleInviteRepository implements InviteRepository {
  constructor(private readonly db: Db) {}

  async create(invite: Omit<InviteRecord, "id" | "useCount" | "revokedAt">) {
    const [row] = await this.db.insert(orgInvites).values(invite).returning();
    if (!row) throw new Error("Invite insert returned no row");
    return toInvite(row);
  }

  async findByCodeHash(codeHash: string) {
    const [row] = await this.db.select().from(orgInvites).where(eq(orgInvites.codeHash, codeHash)).limit(1);
    return row ? toInvite(row) : null;
  }

  async list(orgId: string) {
    return (await this.db.select().from(orgInvites).where(eq(orgInvites.orgId, orgId)).orderBy(desc(orgInvites.createdAt))).map(toInvite);
  }

  async revoke(orgId: string, inviteId: string) {
    await this.db.update(orgInvites).set({ revokedAt: new Date() }).where(and(eq(orgInvites.id, inviteId), eq(orgInvites.orgId, orgId)));
  }

  async consume(inviteId: string, now: Date) {
    const rows = await this.db.update(orgInvites).set({ useCount: sql`${orgInvites.useCount} + 1` })
      .where(and(eq(orgInvites.id, inviteId), isNull(orgInvites.revokedAt), gt(orgInvites.expiresAt, now), lt(orgInvites.useCount, orgInvites.maxUses)))
      .returning({ id: orgInvites.id });
    return rows.length > 0;
  }
}
