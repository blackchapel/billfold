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
import { DrizzleConnectionUsage } from "@/server/infra/repositories/connection-usage";
import { DrizzleRunConfigRepository } from "@/server/infra/repositories/run-config-repository";
import { DrizzleSourceRepository } from "@/server/infra/repositories/source-repository";
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

  describe("sources and run configurations", () => {
    async function world() {
      const r = build();
      const conns = new DrizzleConnectionRepository(db);
      const sources = new DrizzleSourceRepository(db);
      const runConfigs = new DrizzleRunConfigRepository(db);
      const usage = new DrizzleConnectionUsage(db);
      const owner = await newUser(r, "o@example.com");
      const a = await new CreateOrg(r.orgs, r.users, r.audit).execute({ userId: owner.id, name: "Org Alpha", defaultCurrency: "INR" });
      const b = await new CreateOrg(r.orgs, r.users, r.audit).execute({ userId: owner.id, name: "Org Beta", defaultCurrency: "INR" });
      const conn = (orgId: string, kind: "imap" | "google_drive", email: string) =>
        conns.create({ orgId, kind, label: email, accountEmail: email, config: {}, secretCiphertext: "sealed", createdBy: owner.id });
      const mailA = await conn(a.id, "imap", "m@a.com");
      const driveA = await conn(a.id, "google_drive", "d@a.com");
      const mailB = await conn(b.id, "imap", "m@b.com");
      const fields = (connectionId: string, name = "Jio") => ({
        name, connectionId, matcher: { senders: ["@jio.com", "x@y.com"], subjectContains: "bill", attachmentNameContains: null, requireAttachment: true },
        passwordMode: "subject_brackets" as const, passwordPattern: null,
      });
      return { r, conns, sources, runConfigs, usage, owner, a, b, mailA, driveA, mailB, fields };
    }

    it("round-trips source rules, keeps the sealed password out of records, and isolates orgs", async () => {
      const w = await world();
      const s = await w.sources.create(w.a.id, w.owner.id, w.fields(w.mailA.id), "sealed-static-pw");
      expect(s).toMatchObject({ name: "Jio", hasStaticPassword: true, matcher: { senders: ["@jio.com", "x@y.com"], requireAttachment: true } });
      expect(JSON.stringify(s)).not.toContain("sealed-static-pw");
      expect(await w.sources.findPasswordCiphertext(w.a.id, s.id)).toBe("sealed-static-pw");
      expect(await w.sources.findPasswordCiphertext(w.b.id, s.id)).toBeNull();
      expect(await w.sources.find(w.b.id, s.id)).toBeNull();
      expect(await w.sources.list(w.b.id)).toEqual([]);
      expect((await w.sources.findByName(w.a.id, "JIO"))?.id).toBe(s.id);
      expect(await w.sources.update(w.b.id, s.id, w.fields(w.mailB.id), undefined)).toBeNull();
    });

    it("update keeps, replaces or clears the sealed password as told", async () => {
      const w = await world();
      const s = await w.sources.create(w.a.id, w.owner.id, w.fields(w.mailA.id), "pw-1");
      await w.sources.update(w.a.id, s.id, { ...w.fields(w.mailA.id), name: "Jio 2" }, undefined);
      expect(await w.sources.findPasswordCiphertext(w.a.id, s.id)).toBe("pw-1");
      await w.sources.update(w.a.id, s.id, w.fields(w.mailA.id), "pw-2");
      expect(await w.sources.findPasswordCiphertext(w.a.id, s.id)).toBe("pw-2");
      const cleared = await w.sources.update(w.a.id, s.id, w.fields(w.mailA.id), null);
      expect(cleared?.hasStaticPassword).toBe(false);
    });

    it("rejects a second source with the same name in the org, in any letter case, but allows it in another org", async () => {
      const w = await world();
      await w.sources.create(w.a.id, w.owner.id, w.fields(w.mailA.id), null);
      await expect(w.sources.create(w.a.id, w.owner.id, w.fields(w.mailA.id, "JIO"), null)).rejects.toThrow();
      await expect(w.sources.create(w.b.id, w.owner.id, w.fields(w.mailB.id, "JIO"), null)).resolves.toBeTruthy();
    });

    it("stores run configs with their sources, replaces the list on update, and cascades when a source goes", async () => {
      const w = await world();
      const s1 = await w.sources.create(w.a.id, w.owner.id, w.fields(w.mailA.id, "One"), null);
      const s2 = await w.sources.create(w.a.id, w.owner.id, w.fields(w.mailA.id, "Two"), null);
      const rc = await w.runConfigs.create(w.a.id, w.owner.id, { name: "Monthly", driveConnectionId: w.driveA.id, driveFolder: "Billfold", periodMode: "previous_month", sourceIds: [s1.id, s2.id] });
      expect(rc.sourceIds.sort()).toEqual([s1.id, s2.id].sort());
      expect((await w.runConfigs.find(w.a.id, rc.id))?.sourceIds.sort()).toEqual([s1.id, s2.id].sort());
      expect(await w.runConfigs.find(w.b.id, rc.id)).toBeNull();
      expect(await w.runConfigs.update(w.b.id, rc.id, { name: "X", driveConnectionId: w.driveA.id, driveFolder: "F", periodMode: "current_month", sourceIds: [s1.id] })).toBeNull();
      const updated = await w.runConfigs.update(w.a.id, rc.id, { name: "Monthly", driveConnectionId: w.driveA.id, driveFolder: "Bills", periodMode: "current_month", sourceIds: [s2.id] });
      expect(updated).toMatchObject({ driveFolder: "Bills", periodMode: "current_month", sourceIds: [s2.id] });
      expect((await w.runConfigs.list(w.a.id)).map((x) => x.sourceIds)).toEqual([[s2.id]]);
      await w.sources.remove(w.a.id, s2.id);
      expect((await w.runConfigs.find(w.a.id, rc.id))?.sourceIds).toEqual([]);
      await expect(w.runConfigs.create(w.a.id, w.owner.id, { name: "MONTHLY", driveConnectionId: w.driveA.id, driveFolder: "F", periodMode: "previous_month", sourceIds: [s1.id] })).rejects.toThrow();
      await w.runConfigs.remove(w.b.id, rc.id); // wrong org: no effect
      expect(await w.runConfigs.find(w.a.id, rc.id)).not.toBeNull();
      await w.runConfigs.remove(w.a.id, rc.id);
      expect(await w.runConfigs.list(w.a.id)).toEqual([]);
    });

    it("lets the database refuse to delete a connection that sources or run configs still use, and reports who uses it", async () => {
      const w = await world();
      const s = await w.sources.create(w.a.id, w.owner.id, w.fields(w.mailA.id), null);
      await w.runConfigs.create(w.a.id, w.owner.id, { name: "Monthly", driveConnectionId: w.driveA.id, driveFolder: "Billfold", periodMode: "previous_month", sourceIds: [s.id] });
      expect(await w.usage.namesUsing(w.a.id, w.mailA.id)).toEqual(['source "Jio"']);
      expect(await w.usage.namesUsing(w.a.id, w.driveA.id)).toEqual(['run config "Monthly"']);
      expect(await w.usage.namesUsing(w.b.id, w.mailA.id)).toEqual([]);
      await expect(w.conns.remove(w.a.id, w.mailA.id)).rejects.toThrow();
      await expect(w.conns.remove(w.a.id, w.driveA.id)).rejects.toThrow();
    });
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
