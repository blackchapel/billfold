import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors/domain-error";
import { ManageAllowlist } from "@/server/application/allowlist";
import { AuthorizationService } from "@/server/application/authorization";
import { CreateOrg } from "@/server/application/create-org";
import { AcceptInvite, CreateInvite } from "@/server/application/invites";
import { ChangeMemberRole, RemoveMember } from "@/server/application/members";
import { DeleteOrg, RenameOrg, TransferOwnership } from "@/server/application/org-admin";
import { SignInGate } from "@/server/application/sign-in-gate";
import { Memory } from "../../fakes/memory";

let m: Memory;
const authz = () => new AuthorizationService(m.orgRepo, m.memberRepo);
const expectCode = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toBeInstanceOf(DomainError);
  await p.catch((e: DomainError) => expect(e.code).toBe(code));
};

beforeEach(() => { m = new Memory(); });

describe("SignInGate", () => {
  const gate = () => new SignInGate(m.allowlist, m.userRepo, ["root@example.com"]);
  it("rejects emails not on the allowlist", async () => {
    await expectCode(gate().execute({ authUserId: "u1", email: "stranger@example.com", name: null, avatarUrl: null }), "not_allowlisted");
    expect(m.users.size).toBe(0);
  });
  it("admits allowlisted emails case-insensitively and super admins always", async () => {
    m.allowed.add("a@example.com");
    expect((await gate().execute({ authUserId: "u1", email: "A@Example.com", name: null, avatarUrl: null })).email).toBe("a@example.com");
    expect((await gate().execute({ authUserId: "u2", email: "root@example.com", name: null, avatarUrl: null })).id).toBe("u2");
  });
  it("revokes access immediately when removed from the allowlist", async () => {
    m.allowed.add("a@example.com");
    expect(await gate().isStillAllowed("a@example.com")).toBe(true);
    m.allowed.delete("a@example.com");
    expect(await gate().isStillAllowed("a@example.com")).toBe(false);
  });
});

describe("CreateOrg", () => {
  it("creates an org with a unique slug and makes the creator owner", async () => {
    const u = m.addUser("a@example.com");
    const uc = new CreateOrg(m.orgRepo, m.userRepo, m.auditRepo);
    const a = await uc.execute({ userId: u.id, name: "Sharma Home", defaultCurrency: "INR" });
    const b = await uc.execute({ userId: u.id, name: "Sharma Home", defaultCurrency: "INR" });
    expect(a.slug).toBe("sharma-home");
    expect(b.slug).toBe("sharma-home-2");
    expect(m.members.find((x) => x.orgId === a.id)?.role).toBe("owner");
    expect(m.users.get(u.id)?.lastActiveOrgId).toBe(b.id);
  });
  it("never uses a slug that collides with an app route", async () => {
    const u = m.addUser("a@example.com");
    const org = await new CreateOrg(m.orgRepo, m.userRepo, m.auditRepo).execute({ userId: u.id, name: "Admin", defaultCurrency: "INR" });
    expect(org.slug).toBe("admin-org");
  });
  it("rejects bad names", async () => {
    const u = m.addUser("a@example.com");
    await expectCode(new CreateOrg(m.orgRepo, m.userRepo, m.auditRepo).execute({ userId: u.id, name: "x", defaultCurrency: "INR" }), "validation");
  });
});

describe("invites", () => {
  async function setup() {
    const owner = m.addUser("o@example.com");
    const org = await new CreateOrg(m.orgRepo, m.userRepo, m.auditRepo).execute({ userId: owner.id, name: "Team One", defaultCurrency: "INR" });
    const create = new CreateInvite(m.inviteRepo, authz(), m.codes, m.clock, m.auditRepo);
    const accept = new AcceptInvite(m.inviteRepo, m.memberRepo, m.orgRepo, m.userRepo, m.codes, m.clock, m.limiter, m.auditRepo);
    return { owner, org, create, accept };
  }
  it("lets a new user join with a valid code, once, respecting max uses", async () => {
    const { owner, org, create, accept } = await setup();
    const { code } = await create.execute({ userId: owner.id, orgId: org.id, role: "member", maxUses: 1, expiresInDays: 7 });
    const a = m.addUser("a@example.com"), b = m.addUser("b@example.com");
    expect((await accept.execute({ userId: a.id, code })).id).toBe(org.id);
    expect(m.members.find((x) => x.userId === a.id)?.role).toBe("member");
    await expectCode(accept.execute({ userId: b.id, code }), "invite_exhausted");
  });
  it("does not double-count when an existing member re-uses a code", async () => {
    const { owner, org, create, accept } = await setup();
    const { code } = await create.execute({ userId: owner.id, orgId: org.id, role: "member", maxUses: 5, expiresInDays: 7 });
    const a = m.addUser("a@example.com");
    await accept.execute({ userId: a.id, code });
    await accept.execute({ userId: a.id, code });
    expect([...m.invites.values()][0]?.useCount).toBe(1);
  });
  it("rejects expired, revoked, unknown codes and rate-limited callers", async () => {
    const { owner, org, create, accept } = await setup();
    const { code } = await create.execute({ userId: owner.id, orgId: org.id, role: "viewer", maxUses: 5, expiresInDays: 1 });
    const a = m.addUser("a@example.com");
    await expectCode(accept.execute({ userId: a.id, code: "NOPE" }), "invite_invalid");
    m.limitAllows = false;
    await expectCode(accept.execute({ userId: a.id, code }), "rate_limited");
    m.limitAllows = true;
    m.now = new Date("2026-12-01T00:00:00Z");
    await expectCode(accept.execute({ userId: a.id, code }), "invite_expired");
    m.now = new Date("2026-11-01T00:00:00Z");
    [...m.invites.values()][0]!.revokedAt = m.now;
    await expectCode(accept.execute({ userId: a.id, code }), "invite_invalid");
  });
  it("only invite managers can create invites, and never for the owner role", async () => {
    const { owner, org, create, accept } = await setup();
    const { code } = await create.execute({ userId: owner.id, orgId: org.id, role: "member", maxUses: 5, expiresInDays: 7 });
    const member = m.addUser("m@example.com");
    await accept.execute({ userId: member.id, code });
    await expectCode(create.execute({ userId: member.id, orgId: org.id, role: "member", maxUses: 1, expiresInDays: 1 }), "forbidden");
    await expectCode(create.execute({ userId: owner.id, orgId: org.id, role: "owner", maxUses: 1, expiresInDays: 1 }), "validation");
  });
});

describe("members", () => {
  async function org() {
    const owner = m.addUser("o@example.com"), admin = m.addUser("ad@example.com"), member = m.addUser("m@example.com");
    const o = await new CreateOrg(m.orgRepo, m.userRepo, m.auditRepo).execute({ userId: owner.id, name: "Team Two", defaultCurrency: "INR" });
    await m.memberRepo.add(o.id, admin.id, "admin");
    await m.memberRepo.add(o.id, member.id, "member");
    return { owner, admin, member, o };
  }
  it("admins cannot touch owners, owners can; the last owner cannot be demoted or removed", async () => {
    const { owner, admin, o } = await org();
    const change = new ChangeMemberRole(m.memberRepo, authz(), m.auditRepo);
    await expectCode(change.execute({ actorId: admin.id, orgId: o.id, targetUserId: owner.id, role: "member" }), "forbidden");
    await expectCode(change.execute({ actorId: owner.id, orgId: o.id, targetUserId: owner.id, role: "admin" }), "last_owner");
    await expectCode(new RemoveMember(m.memberRepo, authz(), m.auditRepo).execute({ actorId: owner.id, orgId: o.id, targetUserId: owner.id }), "last_owner");
  });
  it("members cannot manage members, but can leave", async () => {
    const { member, o } = await org();
    await expectCode(new ChangeMemberRole(m.memberRepo, authz(), m.auditRepo).execute({ actorId: member.id, orgId: o.id, targetUserId: member.id, role: "admin" }), "forbidden");
    await new RemoveMember(m.memberRepo, authz(), m.auditRepo).execute({ actorId: member.id, orgId: o.id, targetUserId: member.id });
    expect(m.members.some((x) => x.userId === member.id)).toBe(false);
  });
  it("non-members get not_found, never forbidden, so org existence is not leaked", async () => {
    const { o } = await org();
    const stranger = m.addUser("s@example.com");
    await expectCode(authz().require(stranger.id, o.id, "audit.view"), "not_found");
  });
});

describe("allowlist management", () => {
  it("is super-admin only and normalises emails", async () => {
    const uc = new ManageAllowlist(m.allowlist, m.auditRepo);
    await expectCode(uc.add({ actorId: "x", isSuperAdmin: false, email: "a@example.com", note: null }), "forbidden");
    await uc.add({ actorId: "x", isSuperAdmin: true, email: " A@Example.com ", note: null });
    expect(m.allowed.has("a@example.com")).toBe(true);
    await expectCode(uc.add({ actorId: "x", isSuperAdmin: true, email: "nope", note: null }), "validation");
  });
});

describe("org admin", () => {
  async function setup() {
    const owner = m.addUser("o@example.com");
    const other = m.addUser("b@example.com");
    const org = await new CreateOrg(m.orgRepo, m.userRepo, m.auditRepo).execute({ userId: owner.id, name: "Home", defaultCurrency: "INR" });
    await m.memberRepo.add(org.id, other.id, "admin");
    return { owner, other, org };
  }
  it("lets an admin rename but nobody outside the org", async () => {
    const { other, org } = await setup();
    await new RenameOrg(m.orgRepo, authz(), m.auditRepo).execute({ actorId: other.id, orgId: org.id, name: "  Family  " });
    expect(m.orgs.get(org.id)?.name).toBe("Family");
    const stranger = m.addUser("s@example.com");
    await expectCode(new RenameOrg(m.orgRepo, authz(), m.auditRepo).execute({ actorId: stranger.id, orgId: org.id, name: "Mine" }), "not_found");
  });
  it("transfers ownership, demoting the old owner to admin", async () => {
    const { owner, other, org } = await setup();
    const uc = new TransferOwnership(m.memberRepo, authz(), m.auditRepo);
    await expectCode(uc.execute({ actorId: other.id, orgId: org.id, newOwnerId: owner.id }), "forbidden");
    await uc.execute({ actorId: owner.id, orgId: org.id, newOwnerId: other.id });
    expect(m.members.find((x) => x.userId === other.id)?.role).toBe("owner");
    expect(m.members.find((x) => x.userId === owner.id)?.role).toBe("admin");
  });
  it("deletes only for the owner and only with the exact address typed", async () => {
    const { owner, other, org } = await setup();
    const uc = new DeleteOrg(m.orgRepo, authz(), m.auditRepo);
    await expectCode(uc.execute({ actorId: other.id, orgId: org.id, slug: org.slug, confirmSlug: org.slug }), "forbidden");
    await expectCode(uc.execute({ actorId: owner.id, orgId: org.id, slug: org.slug, confirmSlug: "nope" }), "validation");
    await uc.execute({ actorId: owner.id, orgId: org.id, slug: org.slug, confirmSlug: org.slug });
    expect(m.orgs.has(org.id)).toBe(false);
  });
});
