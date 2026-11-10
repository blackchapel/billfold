import { randomUUID } from "node:crypto";
import type { PermissionOverrides, Role } from "@/domain/policies/permissions";
import type { AuditEntry } from "@/domain/ports/repositories";
import type { AllowlistRepository, AuditLogRepository, InviteRepository, MemberRepository, OrgRepository, UserRepository } from "@/domain/ports/repositories";
import type { InviteRecord, MemberRecord, MembershipWithOrg, OrgRecord, UserRecord } from "@/domain/ports/records";
import type { Clock, InviteCodeService, RateLimiter } from "@/domain/ports/services";

export class Memory {
  allowed = new Set<string>();
  users = new Map<string, UserRecord>();
  orgs = new Map<string, OrgRecord>();
  members: MemberRecord[] = [];
  invites = new Map<string, InviteRecord>();
  audit: AuditEntry[] = [];
  now = new Date("2026-11-01T00:00:00Z");
  limitAllows = true;

  allowlist: AllowlistRepository = {
    isAllowed: async (e) => this.allowed.has(e),
    list: async () => [...this.allowed].map((email) => ({ email, note: null, addedBy: null, createdAt: this.now })),
    add: async (e) => void this.allowed.add(e),
    remove: async (e) => void this.allowed.delete(e),
  };
  userRepo: UserRepository = {
    upsert: async (u) => { const r = { ...u, lastActiveOrgId: this.users.get(u.id)?.lastActiveOrgId ?? null }; this.users.set(u.id, r); return r; },
    findById: async (id) => this.users.get(id) ?? null,
    setLastActiveOrg: async (id, orgId) => { const u = this.users.get(id); if (u) u.lastActiveOrgId = orgId; },
    listAll: async () => [...this.users.values()],
  };
  orgRepo: OrgRepository = {
    createWithOwner: async (i) => { const o = { id: randomUUID(), name: i.name, slug: i.slug, defaultCurrency: i.defaultCurrency }; this.orgs.set(o.id, o); this.members.push({ orgId: o.id, userId: i.ownerId, role: "owner", overrides: {} }); return o; },
    slugExists: async (s) => [...this.orgs.values()].some((o) => o.slug === s),
    listForUser: async (uid) => this.members.filter((m) => m.userId === uid).map((m) => ({ ...m, org: this.orgs.get(m.orgId)! }) as MembershipWithOrg),
    findMembershipBySlug: async (uid, slug) => (await this.orgRepo.listForUser(uid)).find((m) => m.org.slug === slug) ?? null,
    listAll: async () => [...this.orgs.values()],
  };
  memberRepo: MemberRepository = {
    find: async (o, u) => this.members.find((m) => m.orgId === o && m.userId === u) ?? null,
    list: async (o) => this.members.filter((m) => m.orgId === o).map((m) => ({ ...m, email: this.users.get(m.userId)?.email ?? "", name: null })),
    add: async (o, u, role) => void this.members.push({ orgId: o, userId: u, role, overrides: {} }),
    updateRole: async (o, u, role: Role) => { const m = this.members.find((x) => x.orgId === o && x.userId === u); if (m) m.role = role; },
    setOverrides: async (o, u, ov: PermissionOverrides) => { const m = this.members.find((x) => x.orgId === o && x.userId === u); if (m) m.overrides = ov; },
    remove: async (o, u) => { this.members = this.members.filter((m) => !(m.orgId === o && m.userId === u)); },
    countOwners: async (o) => this.members.filter((m) => m.orgId === o && m.role === "owner").length,
  };
  inviteRepo: InviteRepository = {
    create: async (i) => { const r = { ...i, id: randomUUID(), useCount: 0, revokedAt: null }; this.invites.set(r.id, r); return r; },
    findByCodeHash: async (h) => [...this.invites.values()].find((i) => i.codeHash === h) ?? null,
    list: async (o) => [...this.invites.values()].filter((i) => i.orgId === o),
    revoke: async (o, id) => { const i = this.invites.get(id); if (i && i.orgId === o) i.revokedAt = this.now; },
    consume: async (id, now) => { const i = this.invites.get(id); if (!i || i.revokedAt || i.expiresAt <= now || i.useCount >= i.maxUses) return false; i.useCount++; return true; },
  };
  auditRepo: AuditLogRepository = {
    record: async (e) => void this.audit.push(e),
    list: async () => [],
  };
  clock: Clock = { now: () => this.now };
  codes: InviteCodeService = { generate: () => ({ code: "CODE12345678", hash: "h:CODE12345678" }), hash: (c) => `h:${c.toUpperCase()}` };
  limiter: RateLimiter = { allow: async () => this.limitAllows };

  addUser(email: string): UserRecord {
    const u = { id: randomUUID(), email, name: null, avatarUrl: null, lastActiveOrgId: null };
    this.users.set(u.id, u);
    return u;
  }
}
