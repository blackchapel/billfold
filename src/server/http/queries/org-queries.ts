import "server-only";
import { effectivePermissions } from "@/domain/policies/permissions";
import { container } from "../../composition-root/container";
import type { OrgSummaryDto } from "@/types/auth";

export async function listMyOrgs(userId: string): Promise<OrgSummaryDto[]> {
  const memberships = await container().repos.orgs.listForUser(userId);
  return memberships.map((m) => ({ id: m.org.id, name: m.org.name, slug: m.org.slug, role: m.role }));
}

/** Where to land after sign-in: the last active org if still a member, else the first org, else onboarding. */
export async function landingPathFor(userId: string): Promise<string> {
  const c = container();
  const [user, orgs] = await Promise.all([c.repos.users.findById(userId), listMyOrgs(userId)]);
  const last = orgs.find((o) => o.id === user?.lastActiveOrgId) ?? orgs[0];
  return last ? `/${last.slug}` : "/onboarding";
}

export async function markActiveOrg(userId: string, orgId: string): Promise<void> {
  await container().repos.users.setLastActiveOrg(userId, orgId);
}

export async function listMembers(orgId: string) {
  const members = await container().repos.members.list(orgId);
  return members.map((m) => ({ ...m, permissions: effectivePermissions(m.role, m.overrides) }));
}

export async function listInvites(orgId: string) {
  const now = Date.now();
  const invites = await container().repos.invites.list(orgId);
  return invites.map((i) => ({
    ...i,
    state: i.revokedAt ? "revoked" : i.expiresAt.getTime() <= now ? "expired" : i.useCount >= i.maxUses ? "used up" : "active",
  }));
}

export async function listAudit(orgId: string) {
  return container().repos.audit.list(orgId, 100);
}

export async function adminOverview() {
  const c = container();
  const [allowlist, users, orgs] = await Promise.all([c.repos.allowlist.list(), c.repos.users.listAll(), c.repos.orgs.listAll()]);
  return { allowlist, users, orgs };
}
