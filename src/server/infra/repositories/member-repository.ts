import { and, eq, count } from "drizzle-orm";
import type { MemberRepository } from "@/domain/ports/repositories";
import type { MemberRecord } from "@/domain/ports/records";
import type { PermissionOverrides, Role } from "@/domain/policies/permissions";
import type { Db } from "../db/create";
import { orgMembers, users } from "../db/schema";

const toMember = (r: typeof orgMembers.$inferSelect): MemberRecord => ({
  orgId: r.orgId, userId: r.userId, role: r.role as Role, overrides: r.permissionOverrides as PermissionOverrides,
});

export class DrizzleMemberRepository implements MemberRepository {
  constructor(private readonly db: Db) {}

  async find(orgId: string, userId: string) {
    const [row] = await this.db.select().from(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId))).limit(1);
    return row ? toMember(row) : null;
  }

  async list(orgId: string) {
    const rows = await this.db.select({ m: orgMembers, email: users.email, name: users.name }).from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId)).where(eq(orgMembers.orgId, orgId)).orderBy(users.email);
    return rows.map((r) => ({ ...toMember(r.m), email: r.email, name: r.name }));
  }

  async add(orgId: string, userId: string, role: Role) {
    await this.db.insert(orgMembers).values({ orgId, userId, role }).onConflictDoNothing();
  }

  async updateRole(orgId: string, userId: string, role: Role) {
    await this.db.update(orgMembers).set({ role }).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
  }

  async setOverrides(orgId: string, userId: string, overrides: PermissionOverrides) {
    await this.db.update(orgMembers).set({ permissionOverrides: overrides as Record<string, boolean> })
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
  }

  async remove(orgId: string, userId: string) {
    await this.db.delete(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
  }

  async countOwners(orgId: string) {
    const [row] = await this.db.select({ n: count() }).from(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "owner")));
    return row?.n ?? 0;
  }
}
