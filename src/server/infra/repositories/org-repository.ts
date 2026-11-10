import { and, eq, isNull } from "drizzle-orm";
import type { OrgRepository } from "@/domain/ports/repositories";
import type { MembershipWithOrg, OrgRecord } from "@/domain/ports/records";
import type { PermissionOverrides, Role } from "@/domain/policies/permissions";
import { newDataKey, parseMasterKey, seal } from "../crypto/envelope";
import type { Db } from "../db/create";
import { orgKeys, orgMembers, orgs } from "../db/schema";

const toOrg = (r: typeof orgs.$inferSelect): OrgRecord => ({
  id: r.id, name: r.name, slug: r.slug, defaultCurrency: r.defaultCurrency,
});

export class DrizzleOrgRepository implements OrgRepository {
  private readonly master: Buffer;

  constructor(private readonly db: Db, masterKeyBase64: string) {
    this.master = parseMasterKey(masterKeyBase64);
  }

  async createWithOwner(input: { name: string; slug: string; defaultCurrency: string; ownerId: string }) {
    return this.db.transaction(async (tx) => {
      const [org] = await tx.insert(orgs).values({ name: input.name, slug: input.slug, defaultCurrency: input.defaultCurrency }).returning();
      if (!org) throw new Error("Org insert returned no row");
      await tx.insert(orgKeys).values({
        orgId: org.id,
        wrappedDataKey: seal(this.master, newDataKey().toString("base64")),
        keyVersion: 1,
      });
      await tx.insert(orgMembers).values({ orgId: org.id, userId: input.ownerId, role: "owner" });
      return toOrg(org);
    });
  }

  async slugExists(slug: string) {
    const rows = await this.db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, slug)).limit(1);
    return rows.length > 0;
  }

  private rowToMembership(m: typeof orgMembers.$inferSelect, o: typeof orgs.$inferSelect): MembershipWithOrg {
    return { orgId: m.orgId, userId: m.userId, role: m.role as Role, overrides: m.permissionOverrides as PermissionOverrides, org: toOrg(o) };
  }

  async listForUser(userId: string) {
    const rows = await this.db.select({ m: orgMembers, o: orgs }).from(orgMembers)
      .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
      .where(and(eq(orgMembers.userId, userId), isNull(orgs.deletedAt)))
      .orderBy(orgs.name);
    return rows.map((r) => this.rowToMembership(r.m, r.o));
  }

  async findMembershipBySlug(userId: string, slug: string) {
    const [row] = await this.db.select({ m: orgMembers, o: orgs }).from(orgMembers)
      .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
      .where(and(eq(orgMembers.userId, userId), eq(orgs.slug, slug), isNull(orgs.deletedAt)))
      .limit(1);
    return row ? this.rowToMembership(row.m, row.o) : null;
  }

  async listAll() {
    return (await this.db.select().from(orgs).where(isNull(orgs.deletedAt)).orderBy(orgs.name)).map(toOrg);
  }
}
