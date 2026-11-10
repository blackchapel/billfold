import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AcceptInvite, CreateInvite } from "@/server/application/invites";
import { AuthorizationService } from "@/server/application/authorization";
import { CreateOrg } from "@/server/application/create-org";
import { HashedInviteCodes } from "@/server/infra/crypto/invite-codes";
import { OrgSecretBox } from "@/server/infra/crypto/org-secret-box";
import { DrizzleAuditLogRepository } from "@/server/infra/repositories/audit-log-repository";
import { DrizzleConnectionRepository } from "@/server/infra/repositories/connection-repository";
import { DrizzleInviteRepository } from "@/server/infra/repositories/invite-repository";
import { DrizzleMemberRepository } from "@/server/infra/repositories/member-repository";
import { DrizzleOrgRepository } from "@/server/infra/repositories/org-repository";
import { PostgresRateLimiter } from "@/server/infra/repositories/rate-limiter";
import { DrizzleUserRepository } from "@/server/infra/repositories/user-repository";
import { orgKeys } from "@/server/infra/db/schema";
import { prepareDb, resetDb, TEST_DB_URL } from "./db";

const MASTER = randomBytes(32).toString("base64");
const run = TEST_DB_URL ? describe : describe.skip;

run("repositories (real Postgres)", () => {
  let db: Awaited<ReturnType<typeof prepareDb>>;
  const clock = { now: () => new Date() };

  beforeAll(async () => { db = await prepareDb(); });
  beforeEach(async () => { await resetDb(db); });
  afterAll(async () => { await resetDb(db); });

  const build = () => {
    const users = new DrizzleUserRepository(db);
    const orgs = new DrizzleOrgRepository(db, MASTER);
    const members = new DrizzleMemberRepository(db);
    const invites = new DrizzleInviteRepository(db);
    const audit = new DrizzleAuditLogRepository(db);
    const codes = new HashedInviteCodes();
    return { users, orgs, members, invites, audit, codes, authz: new AuthorizationService(orgs, members) };
  };
  const newUser = (r: ReturnType<typeof build>, email: string) => r.users.upsert({ id: randomUUID(), email, name: null, avatarUrl: null });

  it("isolates orgs: a user only sees and resolves orgs they belong to", async () => {
    const r = build();
    const a = await newUser(r, "a@example.com"), b = await newUser(r, "b@example.com");
    const createOrg = new CreateOrg(r.orgs, r.users, r.audit);
    const orgA = await createOrg.execute({ userId: a.id, name: "Org Alpha", defaultCurrency: "INR" });
    await createOrg.execute({ userId: b.id, name: "Org Beta", defaultCurrency: "INR" });
    expect((await r.orgs.listForUser(a.id)).map((m) => m.org.slug)).toEqual(["org-alpha"]);
    expect(await r.orgs.findMembershipBySlug(b.id, orgA.slug)).toBeNull();
    await expect(r.authz.require(b.id, orgA.id, "audit.view")).rejects.toMatchObject({ code: "not_found" });
    expect(await r.audit.list(orgA.id, 10)).toHaveLength(1);
  });

  it("creates an org atomically with an owner and a wrapped key, and encrypts per org", async () => {
    const r = build();
    const u = await newUser(r, "a@example.com");
    const org = await new CreateOrg(r.orgs, r.users, r.audit).execute({ userId: u.id, name: "Org Alpha", defaultCurrency: "INR" });
    const box = new OrgSecretBox(db, MASTER);
    const sealed = await box.encrypt(org.id, "pdf-password");
    expect(sealed).not.toContain("pdf-password");
    expect(await box.decrypt(org.id, sealed)).toBe("pdf-password");
    const [row] = await db.select().from(orgKeys);
    expect(row?.wrappedDataKey.startsWith("v1.")).toBe(true);
  });

  it("crypto-shreds: deleting the org key makes secrets unrecoverable", async () => {
    const r = build();
    const u = await newUser(r, "a@example.com");
    const org = await new CreateOrg(r.orgs, r.users, r.audit).execute({ userId: u.id, name: "Org Alpha", defaultCurrency: "INR" });
    const sealed = await new OrgSecretBox(db, MASTER).encrypt(org.id, "secret");
    await db.execute(sql`delete from org_keys where org_id = ${org.id}`);
    await expect(new OrgSecretBox(db, MASTER).decrypt(org.id, sealed)).rejects.toThrow();
  });

  it("consumes an invite atomically: concurrent joins never exceed max uses", async () => {
    const r = build();
    const owner = await newUser(r, "o@example.com");
    const org = await new CreateOrg(r.orgs, r.users, r.audit).execute({ userId: owner.id, name: "Org Alpha", defaultCurrency: "INR" });
    const { code } = await new CreateInvite(r.invites, r.authz, r.codes, clock, r.audit).execute({ userId: owner.id, orgId: org.id, role: "member", maxUses: 2, expiresInDays: 7 });
    const limiter = new PostgresRateLimiter(db);
    const accept = new AcceptInvite(r.invites, r.members, r.orgs, r.users, r.codes, clock, limiter, r.audit);
    const joiners = await Promise.all(Array.from({ length: 5 }, (_, i) => newUser(r, `j${i}@example.com`)));
    const results = await Promise.allSettled(joiners.map((j) => accept.execute({ userId: j.id, code })));
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(2);
    expect((await r.members.list(org.id)).length).toBe(3);
  });

  it("stores only a hash of the invite code", async () => {
    const r = build();
    const owner = await newUser(r, "o@example.com");
    const org = await new CreateOrg(r.orgs, r.users, r.audit).execute({ userId: owner.id, name: "Org Alpha", defaultCurrency: "INR" });
    const { code } = await new CreateInvite(r.invites, r.authz, r.codes, clock, r.audit).execute({ userId: owner.id, orgId: org.id, role: "member", maxUses: 1, expiresInDays: 1 });
    const rows = await db.execute(sql`select code_hash from org_invites`);
    expect(JSON.stringify(rows)).not.toContain(code);
  });

  it("renames an org and, on delete, hides it and destroys its encryption key", async () => {
    const r = build();
    const owner = await newUser(r, "o@example.com");
    const org = await new CreateOrg(r.orgs, r.users, r.audit).execute({ userId: owner.id, name: "Org Alpha", defaultCurrency: "INR" });
    await r.orgs.rename(org.id, "Org Beta");
    expect((await r.orgs.findMembershipBySlug(owner.id, org.slug))?.org.name).toBe("Org Beta");
    await r.orgs.softDeleteAndShred(org.id);
    expect(await r.orgs.findMembershipBySlug(owner.id, org.slug)).toBeNull();
    expect(await db.select().from(orgKeys)).toHaveLength(0);
  });

  it("keeps connections per org, never returns the secret in records, and shreds with the org", async () => {
    const r = build();
    const repo = new DrizzleConnectionRepository(db);
    const box = new OrgSecretBox(db, MASTER);
    const owner = await newUser(r, "o@example.com");
    const a = await new CreateOrg(r.orgs, r.users, r.audit).execute({ userId: owner.id, name: "Org Alpha", defaultCurrency: "INR" });
    const b = await new CreateOrg(r.orgs, r.users, r.audit).execute({ userId: owner.id, name: "Org Beta", defaultCurrency: "INR" });
    const cipher = await box.encrypt(a.id, JSON.stringify({ password: "hunter2-app" }));
    const c = await repo.create({ orgId: a.id, kind: "imap", label: "Bills", accountEmail: "bills@example.com", config: { host: "imap.example.com", port: 993 }, secretCiphertext: cipher, createdBy: owner.id });
    expect(JSON.stringify(c)).not.toContain("hunter2");
    expect(JSON.stringify(await db.execute(sql`select * from connections`))).not.toContain("hunter2");
    expect(await repo.list(b.id)).toEqual([]);
    expect(await repo.find(b.id, c.id)).toBeNull();
    expect(await repo.findSecret(b.id, c.id)).toBeNull();
    expect(JSON.parse(await box.decrypt(a.id, (await repo.findSecret(a.id, c.id)) ?? ""))).toEqual({ password: "hunter2-app" });
    await expect(repo.create({ orgId: a.id, kind: "imap", label: "Dup", accountEmail: "bills@example.com", config: {}, secretCiphertext: cipher, createdBy: owner.id })).rejects.toThrow();
    await repo.recordCheck(a.id, c.id, { status: "needs_attention", error: "nope", at: new Date() });
    expect((await repo.find(a.id, c.id))?.status).toBe("needs_attention");
    await repo.replaceSecret(a.id, c.id, cipher);
    expect((await repo.find(a.id, c.id))).toMatchObject({ status: "active", lastError: null });
    await repo.remove(b.id, c.id); // wrong org: must not delete
    expect(await repo.find(a.id, c.id)).not.toBeNull();
    await repo.remove(a.id, c.id);
    expect(await repo.list(a.id)).toEqual([]);
  });

  it("rate limiter blocks after the limit within the window", async () => {
    const limiter = new PostgresRateLimiter(db);
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.allow("k", 3, 60));
    expect(results).toEqual([true, true, true, false]);
  });

  it("has row level security enabled on every public table", async () => {
    const rows = (await db.execute(sql`select tablename from pg_tables where schemaname='public' and rowsecurity = false and tablename not like '\\_\\_drizzle%'`)) as unknown as { tablename: string }[];
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });
});
