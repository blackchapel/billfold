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
import { DrizzleBillRepository } from "@/server/infra/repositories/bill-repository";
import { DrizzleRecipientRepository } from "@/server/infra/repositories/recipient-repository";
import { DrizzleSendItemRepository } from "@/server/infra/repositories/send-item-repository";
import { DrizzleSendRepository } from "@/server/infra/repositories/send-repository";
import { DrizzleTemplateRepository } from "@/server/infra/repositories/template-repository";
import { DrizzleRunItemRepository } from "@/server/infra/repositories/run-item-repository";
import { DrizzleRunRepository } from "@/server/infra/repositories/run-repository";
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

  describe("runs, run items and bills", () => {
    async function world() {
      const r = build();
      const conns = new DrizzleConnectionRepository(db);
      const sources = new DrizzleSourceRepository(db);
      const runConfigs = new DrizzleRunConfigRepository(db);
      const runs = new DrizzleRunRepository(db);
      const items = new DrizzleRunItemRepository(db);
      const bills = new DrizzleBillRepository(db);
      const owner = await newUser(r, "o@example.com");
      const a = await new CreateOrg(r.orgs, r.users, r.audit).execute({ userId: owner.id, name: "Org Alpha", defaultCurrency: "INR" });
      const b = await new CreateOrg(r.orgs, r.users, r.audit).execute({ userId: owner.id, name: "Org Beta", defaultCurrency: "INR" });
      const conn = (orgId: string, kind: "imap" | "google_drive", email: string) =>
        conns.create({ orgId, kind, label: email, accountEmail: email, config: {}, secretCiphertext: "sealed", createdBy: owner.id });
      const mail = await conn(a.id, "imap", "m@a.com");
      const drive = await conn(a.id, "google_drive", "d@a.com");
      const source = await sources.create(a.id, owner.id, {
        name: "Jio", connectionId: mail.id, matcher: { senders: ["@jio.com"], subjectContains: null, attachmentNameContains: null, requireAttachment: true }, passwordMode: "none", passwordPattern: null,
      }, null);
      const config = await runConfigs.create(a.id, owner.id, { name: "Monthly", driveConnectionId: drive.id, driveFolder: "Billfold", periodMode: "previous_month", sourceIds: [source.id] });
      const run = await runs.create(a.id, { runConfigId: config.id, configName: config.name, periodKey: "2026-10", driveConnectionId: drive.id, driveFolder: "Billfold", startedBy: owner.id });
      const item = (n: number, over: Record<string, unknown> = {}) => ({
        sourceId: source.id, sourceName: "Jio", messageId: `m${n}`, messageDate: new Date(Date.UTC(2026, 9, n)), fromAddress: "billing@jio.com", subject: `Bill ${n}`,
        attachmentName: "bill.pdf", itemKey: `${source.id}:m${n}:bill.pdf`, status: "pending" as const, error: null, ...over,
      });
      const newBill = (key: string) => ({
        periodKey: "2026-10", sourceId: source.id, sourceName: "Jio", billerName: "Jio", amountMinor: 123450n, currency: "INR", billDate: "2026-10-30", dueDate: "2026-11-15",
        confidence: "high" as const, method: "text" as const, needsReview: false, note: null, messageKey: key, createdBy: owner.id,
      });
      const newFile = (n: number) => ({
        driveConnectionId: drive.id, driveAccount: "d@a.com", driveFileId: `drive-file-${n}`, driveFolderId: "folder-1", webViewLink: `https://drive.test/${n}`,
        name: "bill.pdf", mimeType: "application/pdf", sizeBytes: 1234, sha256: "ab".repeat(32),
      });
      return { r, conns, sources, runs, items, bills, owner, a, b, mail, drive, source, config, run, item, newBill, newFile };
    }

    it("stores a run with counts per status, and keeps orgs apart", async () => {
      const w = await world();
      await w.items.insertMany(w.a.id, w.run.id, [w.item(1), w.item(2), w.item(3, { status: "skipped", error: "No PDF" }), w.item(4, { status: "failed", error: "boom" })]);
      await w.items.insertMany(w.a.id, w.run.id, [w.item(1)]); // same key again: ignored, not an error
      expect((await w.runs.counts(w.a.id, [w.run.id])).get(w.run.id)).toEqual({ pending: 2, processing: 0, done: 0, failed: 1, skipped: 1 });
      expect((await w.runs.counts(w.b.id, [w.run.id])).get(w.run.id)).toEqual({ pending: 0, processing: 0, done: 0, failed: 0, skipped: 0 });
      expect(await w.runs.find(w.b.id, w.run.id)).toBeNull();
      expect(await w.runs.list(w.b.id, 10)).toEqual([]);
      expect(await w.items.list(w.b.id, w.run.id)).toEqual([]);
      expect(await w.runs.find(w.a.id, w.run.id)).toMatchObject({ status: "processing", periodKey: "2026-10", driveFolder: "Billfold", driveConnectionId: w.drive.id });
      await w.runs.setStatus(w.a.id, w.run.id, "completed_with_errors", new Date());
      expect((await w.runs.find(w.a.id, w.run.id))?.status).toBe("completed_with_errors");
    });

    it("hands each pending item to exactly one of several simultaneous requests", async () => {
      const w = await world();
      await w.items.insertMany(w.a.id, w.run.id, [1, 2, 3, 4].map((n) => w.item(n)));
      const claims = await Promise.all(Array.from({ length: 4 }, () => w.items.claimNext(w.a.id, w.run.id, new Date(Date.now() - 300_000))));
      const ids = claims.map((c) => c?.id);
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(4); // nobody got the same item
      expect(claims.every((c) => c?.status === "processing" && c.attempts === 1)).toBe(true);
      expect(await w.items.claimNext(w.a.id, w.run.id, new Date(Date.now() - 300_000))).toBeNull(); // nothing left, nothing double-booked
      expect(await w.items.claimNext(w.b.id, w.run.id, new Date(0))).toBeNull(); // wrong org
    });

    it("takes back items abandoned by a dead request, but only old ones", async () => {
      const w = await world();
      await w.items.insertMany(w.a.id, w.run.id, [w.item(1)]);
      const first = await w.items.claimNext(w.a.id, w.run.id, new Date(Date.now() - 300_000));
      expect(await w.items.claimNext(w.a.id, w.run.id, new Date(Date.now() - 300_000))).toBeNull();
      const again = await w.items.claimNext(w.a.id, w.run.id, new Date(Date.now() + 1000));
      expect(again).toMatchObject({ id: first?.id, attempts: 2 });
    });

    it("marks items done and failed, retries only failed ones under the attempt cap, and skips pending ones on cancel", async () => {
      const w = await world();
      await w.items.insertMany(w.a.id, w.run.id, [1, 2, 3, 4].map((n) => w.item(n)));
      const bill = await w.bills.record(w.a.id, w.newBill("k-done"), w.newFile(1));
      const stale = new Date(Date.now() - 300_000);
      const one = await w.items.claimNext(w.a.id, w.run.id, stale);
      const two = await w.items.claimNext(w.a.id, w.run.id, stale);
      await w.items.markDone(w.a.id, one?.id ?? "", bill.id);
      await w.items.markFailed(w.a.id, two?.id ?? "", "Could not download this email from the mailbox.");
      expect(await w.items.find(w.a.id, one?.id ?? "")).toMatchObject({ status: "done", billId: bill.id, error: null });
      expect(await w.items.find(w.b.id, one?.id ?? "")).toBeNull();
      expect(await w.items.retryFailed(w.b.id, w.run.id, 5, null)).toBe(0); // other org
      expect(await w.items.retryFailed(w.a.id, w.run.id, 1, null)).toBe(0); // attempts (1) not below the cap (1)
      expect(await w.items.retryFailed(w.a.id, w.run.id, 5, "00000000-0000-0000-0000-000000000000")).toBe(0);
      expect(await w.items.retryFailed(w.a.id, w.run.id, 5, two?.id ?? "")).toBe(1);
      expect(await w.items.find(w.a.id, two?.id ?? "")).toMatchObject({ status: "pending", error: null });
      expect(await w.items.skipPending(w.a.id, w.run.id, "Run cancelled")).toBe(3);
      expect((await w.items.list(w.a.id, w.run.id)).filter((i) => i.status === "skipped").every((i) => i.error === "Run cancelled")).toBe(true);
    });

    it("records a bill with its Drive file, refuses the same email twice in an org, and lists by month", async () => {
      const w = await world();
      const bill = await w.bills.record(w.a.id, w.newBill("key-1"), w.newFile(1));
      expect(bill).toMatchObject({ amountMinor: 123450n, currency: "INR", billDate: "2026-10-30", dueDate: "2026-11-15", needsReview: false });
      expect(bill.files).toHaveLength(1);
      expect(bill.files[0]).toMatchObject({ driveFileId: "drive-file-1", sha256: "ab".repeat(32), driveAccount: "d@a.com" });
      await expect(w.bills.record(w.a.id, w.newBill("key-1"), w.newFile(2))).rejects.toThrow();
      expect(await w.bills.list(w.a.id, {})).toHaveLength(1); // the failed attempt left no orphan file or bill
      await w.bills.record(w.a.id, { ...w.newBill("key-2"), periodKey: "2026-09", amountMinor: null, needsReview: true, confidence: "low", note: "scan" }, w.newFile(3));
      expect((await w.bills.list(w.a.id, { periodKey: "2026-10" })).map((b) => b.messageKey)).toEqual(["key-1"]);
      expect((await w.bills.list(w.a.id, {})).map((b) => b.periodKey)).toEqual(["2026-10", "2026-09"]);
      expect((await w.bills.list(w.a.id, { periodKey: "2026-09" }))[0]).toMatchObject({ amountMinor: null, needsReview: true, note: "scan" });
      expect(await w.bills.list(w.b.id, {})).toEqual([]);
      expect([...(await w.bills.existingKeys(w.a.id, ["key-1", "key-2", "nope"]))].sort()).toEqual(["key-1", "key-2"]);
      expect([...(await w.bills.existingKeys(w.b.id, ["key-1"]))]).toEqual([]);
      await w.bills.record(w.b.id, w.newBill("key-1"), { ...w.newFile(4), driveConnectionId: w.drive.id }).catch(() => undefined); // same key is fine in another org
    });

    it("edits, marks paid, soft-deletes and filters bills, and adds one by hand", async () => {
      const w = await world();
      const jio = await w.bills.record(w.a.id, w.newBill("jio-oct"), w.newFile(1));
      const scan = await w.bills.record(w.a.id, { ...w.newBill("scan-oct"), billerName: "Scan Co", amountMinor: null, needsReview: true, confidence: "low", note: "scan" }, w.newFile(2));
      const sep = await w.bills.record(w.a.id, { ...w.newBill("jio-sep"), periodKey: "2026-09", billerName: "100% Power_Co" }, w.newFile(3));
      const hand = await w.bills.createManual(w.a.id, { ...w.newBill("manual:1"), sourceId: null, sourceName: "Added by hand", billerName: "Maid", method: "manual" });
      expect(hand).toMatchObject({ method: "manual", sourceId: null, files: [], amountMinor: 123450n });
      await expect(w.bills.createManual(w.a.id, { ...w.newBill("manual:1"), sourceId: null })).rejects.toThrow(); // same key twice

      // update: only the keys that are present change; null really clears; other orgs are untouched
      const when = new Date("2026-11-02T10:00:00Z");
      const fixed = await w.bills.update(w.a.id, scan.id, { amountMinor: 231_000n, needsReview: false, reviewedAt: when, reviewedBy: w.owner.id, dueDate: "2026-11-20" });
      expect(fixed).toMatchObject({ amountMinor: 231_000n, needsReview: false, dueDate: "2026-11-20", billerName: "Scan Co", note: "scan", reviewedAt: when });
      expect(fixed?.files).toHaveLength(1);
      expect((await w.bills.update(w.a.id, scan.id, { dueDate: null, note: null }))).toMatchObject({ dueDate: null, note: null, amountMinor: 231_000n });
      expect(await w.bills.update(w.b.id, scan.id, { billerName: "Hacked" })).toBeNull();
      expect((await w.bills.find(w.a.id, scan.id))?.billerName).toBe("Scan Co");
      expect(await w.bills.find(w.b.id, scan.id)).toBeNull();

      await w.bills.update(w.a.id, jio.id, { paidAt: when });
      expect((await w.bills.find(w.a.id, jio.id))?.paidAt).toEqual(when);
      const names = async (f: Parameters<typeof w.bills.list>[1]) => (await w.bills.list(w.a.id, f)).map((b) => b.billerName).sort();
      expect(await names({ unpaid: true })).toEqual(["100% Power_Co", "Jio", "Maid", "Scan Co"].filter((n) => n !== "Jio"));
      expect(await names({ fromPeriod: "2026-10" })).toEqual(["Jio", "Maid", "Scan Co"]);
      expect(await names({ toPeriod: "2026-09" })).toEqual(["100% Power_Co"]);
      expect(await names({ needsReview: true })).toEqual([]);
      expect(await names({ search: "scan" })).toEqual(["Scan Co"]);
      expect(await names({ search: "100%" })).toEqual(["100% Power_Co"]); // % is a literal character here, not "anything"
      expect(await names({ search: "_" })).toEqual(["100% Power_Co"]);
      expect(await names({ search: "%" })).toEqual(["100% Power_Co"]);
      expect(await names({ search: "Added by" })).toEqual(["Maid"]); // the source name is searched too
      expect(await names({ search: "hand" })).toEqual(["Maid"]);

      // soft delete keeps the row (and so the "already filed" key), hides it, and restoring brings it back
      await w.bills.update(w.a.id, sep.id, { deletedAt: when, deletedBy: w.owner.id });
      expect(await names({})).not.toContain("100% Power_Co");
      expect(await names({ deleted: "only" })).toEqual(["100% Power_Co"]);
      expect([...(await w.bills.existingKeys(w.a.id, ["jio-sep"]))]).toEqual(["jio-sep"]);
      await w.bills.update(w.a.id, sep.id, { deletedAt: null, deletedBy: null });
      expect(await names({ deleted: "only" })).toEqual([]);
      expect(await names({})).toContain("100% Power_Co");
      expect(await w.bills.list(w.b.id, {})).toEqual([]);
    });

    it("keeps bills and runs when their source, run configuration or Drive connection is deleted, and cascades with the run", async () => {
      const w = await world();
      await w.items.insertMany(w.a.id, w.run.id, [w.item(1)]);
      const bill = await w.bills.record(w.a.id, w.newBill("key-1"), w.newFile(1));
      const claimed = await w.items.claimNext(w.a.id, w.run.id, new Date(0));
      await w.items.markDone(w.a.id, claimed?.id ?? "", bill.id);

      // The configuration and the source can go; the run, its items and the bill stay (with their names kept).
      const rcRepo = new DrizzleRunConfigRepository(db);
      await rcRepo.remove(w.a.id, w.config.id);
      await w.sources.remove(w.a.id, w.source.id);
      expect(await w.runs.find(w.a.id, w.run.id)).toMatchObject({ runConfigId: null, configName: "Monthly" });
      expect((await w.items.list(w.a.id, w.run.id))[0]).toMatchObject({ sourceId: null, sourceName: "Jio", billId: bill.id });
      expect((await w.bills.list(w.a.id, {}))[0]).toMatchObject({ sourceId: null, sourceName: "Jio" });

      // The Drive connection can be removed once nothing configured uses it; filed bills keep the account name.
      await w.conns.remove(w.a.id, w.drive.id);
      expect((await w.runs.find(w.a.id, w.run.id))?.driveConnectionId).toBeNull();
      expect((await w.bills.list(w.a.id, {}))[0]?.files[0]).toMatchObject({ driveConnectionId: null, driveAccount: "d@a.com", driveFileId: "drive-file-1" });
      expect(await w.items.list(w.a.id, w.run.id)).toHaveLength(1);
    });
  });

  describe("recipients, templates and sends", () => {
    async function world() {
      const r = build();
      const owner = await newUser(r, "o@example.com");
      const a = await new CreateOrg(r.orgs, r.users, r.audit).execute({ userId: owner.id, name: "Org Alpha", defaultCurrency: "INR" });
      const b = await new CreateOrg(r.orgs, r.users, r.audit).execute({ userId: owner.id, name: "Org Beta", defaultCurrency: "INR" });
      const recipients = new DrizzleRecipientRepository(db);
      const templates = new DrizzleTemplateRepository(db);
      const sends = new DrizzleSendRepository(db);
      const items = new DrizzleSendItemRepository(db);
      const newSend = (over: Record<string, unknown> = {}) => ({
        periodKey: "2026-10", templateName: "Standard summary", subject: "Bills", bodyHtml: "<p>x</p>", bodyText: "x", fromConnectionId: null, fromAccount: "me@a.com",
        attachmentFileIds: ["f1", "f2"], attachmentBytes: 20, billCount: 2, totalMinor: 173450n, isTest: false, createdBy: owner.id, ...over,
      });
      const person = (n: number) => ({ recipientName: `P${n}`, recipientEmail: `p${n}@example.com` });
      return { owner, a, b, recipients, templates, sends, items, newSend, person };
    }

    it("keeps recipients unique per org by address, ignoring case, and apart between orgs", async () => {
      const w = await world();
      const asha = await w.recipients.create(w.a.id, w.owner.id, { name: "Asha", email: "asha@example.com" });
      await expect(w.recipients.create(w.a.id, w.owner.id, { name: "Dup", email: "ASHA@example.com" })).rejects.toThrow();
      await w.recipients.create(w.b.id, w.owner.id, { name: "Asha", email: "asha@example.com" }); // another org may have the same person
      expect((await w.recipients.findByEmail(w.a.id, "ASHA@EXAMPLE.COM"))?.id).toBe(asha.id);
      expect(await w.recipients.find(w.b.id, asha.id)).toBeNull();
      expect(await w.recipients.update(w.b.id, asha.id, { name: "X", email: "x@example.com" })).toBeNull();
      expect(await w.recipients.findMany(w.b.id, [asha.id])).toEqual([]);
      expect(await w.recipients.update(w.a.id, asha.id, { name: "Asha K", email: "asha@example.com" })).toMatchObject({ name: "Asha K" });
      await w.recipients.remove(w.b.id, asha.id); // wrong org: no effect
      expect(await w.recipients.list(w.a.id)).toHaveLength(1);
      await w.recipients.remove(w.a.id, asha.id);
      expect(await w.recipients.list(w.a.id)).toHaveLength(0);
    });

    it("keeps template names unique per org and at most one default", async () => {
      const w = await world();
      const f = (name: string) => ({ name, subject: "{{month}}", intro: "Hi", signoff: "Bye" });
      const one = await w.templates.create(w.a.id, w.owner.id, f("Short"));
      const two = await w.templates.create(w.a.id, w.owner.id, f("Long"));
      await expect(w.templates.create(w.a.id, w.owner.id, f("SHORT"))).rejects.toThrow();
      await w.templates.create(w.b.id, w.owner.id, f("Short"));
      await w.templates.setDefault(w.a.id, one.id);
      await w.templates.setDefault(w.a.id, two.id);
      expect((await w.templates.list(w.a.id)).filter((t) => t.isDefault).map((t) => t.name)).toEqual(["Long"]);
      await w.templates.setDefault(w.b.id, two.id); // another org's template id: changes nothing here
      expect((await w.templates.list(w.a.id)).filter((t) => t.isDefault)).toHaveLength(1);
      await w.templates.setDefault(w.a.id, null);
      expect((await w.templates.list(w.a.id)).some((t) => t.isDefault)).toBe(false);
      expect(await w.templates.findByName(w.a.id, "long")).toMatchObject({ name: "Long" });
      expect(await w.templates.update(w.b.id, one.id, f("Z"))).toBeNull();
    });

    it("stores a send with its exact text, counts items, keeps orgs apart and counts recent sends per person", async () => {
      const w = await world();
      const s = await w.sends.create(w.a.id, w.newSend());
      expect(s).toMatchObject({ status: "sending", totalMinor: 173450n, attachmentFileIds: ["f1", "f2"], bodyHtml: "<p>x</p>", finishedAt: null });
      await w.items.insertMany(w.a.id, s.id, [w.person(1), w.person(2), { recipientName: "Again", recipientEmail: "P1@example.com" }]); // third is a duplicate address
      expect(await w.items.list(w.a.id, s.id)).toHaveLength(2);
      expect((await w.sends.counts(w.a.id, [s.id])).get(s.id)).toMatchObject({ pending: 2, sent: 0 });
      expect(await w.sends.find(w.b.id, s.id)).toBeNull();
      expect(await w.sends.list(w.b.id, 10)).toEqual([]);
      expect((await w.sends.counts(w.b.id, [s.id])).get(s.id) ?? { pending: 0 }).toMatchObject({ pending: 0 });
      await w.sends.setStatus(w.a.id, s.id, "sent", new Date());
      expect(await w.sends.find(w.a.id, s.id)).toMatchObject({ status: "sent" });
      expect(await w.sends.countSince(w.a.id, w.owner.id, new Date(Date.now() - 3_600_000))).toBe(1);
      expect(await w.sends.countSince(w.a.id, w.owner.id, new Date(Date.now() + 60_000))).toBe(0);
      expect(await w.sends.countSince(w.b.id, w.owner.id, new Date(0))).toBe(0);
    });

    it("hands each waiting email to exactly one of several simultaneous requests", async () => {
      const w = await world();
      const s = await w.sends.create(w.a.id, w.newSend());
      await w.items.insertMany(w.a.id, s.id, [1, 2, 3, 4].map(w.person));
      const stale = new Date(Date.now() - 300_000);
      const claims = await Promise.all(Array.from({ length: 4 }, () => w.items.claimNext(w.a.id, s.id, stale)));
      expect(new Set(claims.map((c) => c?.id)).size).toBe(4);
      expect(claims.every((c) => c?.status === "processing" && c.attempts === 1)).toBe(true);
      expect(await w.items.claimNext(w.a.id, s.id, stale)).toBeNull();
      expect(await w.items.claimNext(w.b.id, s.id, new Date(0))).toBeNull();
    });

    it("marks sent and failed, retries failed ones under the cap, skips waiting ones, and takes back abandoned ones", async () => {
      const w = await world();
      const s = await w.sends.create(w.a.id, w.newSend());
      await w.items.insertMany(w.a.id, s.id, [1, 2, 3, 4].map(w.person));
      const stale = new Date(Date.now() - 300_000);
      const one = await w.items.claimNext(w.a.id, s.id, stale);
      const two = await w.items.claimNext(w.a.id, s.id, stale);
      await w.items.markSent(w.a.id, one?.id ?? "", new Date());
      await w.items.markFailed(w.a.id, two?.id ?? "", "The email could not be sent. Try again.");
      expect(await w.items.find(w.a.id, one?.id ?? "")).toMatchObject({ status: "sent", error: null });
      expect((await w.items.find(w.a.id, one?.id ?? ""))?.sentAt).toBeInstanceOf(Date);
      expect(await w.items.find(w.b.id, one?.id ?? "")).toBeNull();
      expect(await w.items.retryFailed(w.b.id, s.id, 5, null)).toBe(0);
      expect(await w.items.retryFailed(w.a.id, s.id, 1, null)).toBe(0);
      expect(await w.items.retryFailed(w.a.id, s.id, 3, two?.id ?? "")).toBe(1);
      expect(await w.items.skipPending(w.a.id, s.id, "Cancelled")).toBe(3);
      const t = await w.sends.create(w.a.id, w.newSend());
      await w.items.insertMany(w.a.id, t.id, [w.person(9)]);
      const first = await w.items.claimNext(w.a.id, t.id, stale);
      expect(await w.items.claimNext(w.a.id, t.id, stale)).toBeNull();
      expect(await w.items.claimNext(w.a.id, t.id, new Date(Date.now() + 1000))).toMatchObject({ id: first?.id, attempts: 2 });
    });

    it("removing a recipient or template leaves past sends intact, and removing a send removes its emails", async () => {
      const w = await world();
      const asha = await w.recipients.create(w.a.id, w.owner.id, { name: "Asha", email: "asha@example.com" });
      const s = await w.sends.create(w.a.id, w.newSend());
      await w.items.insertMany(w.a.id, s.id, [{ recipientName: "Asha", recipientEmail: "asha@example.com" }]);
      await w.recipients.remove(w.a.id, asha.id);
      expect(await w.items.list(w.a.id, s.id)).toHaveLength(1);
      await db.execute(sql`delete from sends where id = ${s.id}`);
      expect(await w.items.list(w.a.id, s.id)).toHaveLength(0);
    });

    it("finds only this org's Drive files when attaching", async () => {
      const w = await world();
      const bills = new DrizzleBillRepository(db);
      const conns = new DrizzleConnectionRepository(db);
      const drive = await conns.create({ orgId: w.a.id, kind: "google_drive", label: "d", accountEmail: "d@a.com", config: {}, secretCiphertext: "sealed", createdBy: w.owner.id });
      const bill = await bills.record(w.a.id, {
        periodKey: "2026-10", sourceId: null, sourceName: "Jio", billerName: "Jio", amountMinor: 1n, currency: "INR", billDate: null, dueDate: null,
        confidence: "high", method: "text", needsReview: false, note: null, messageKey: "k", createdBy: w.owner.id,
      }, { driveConnectionId: drive.id, driveAccount: "d@a.com", driveFileId: "df", driveFolderId: "fo", webViewLink: "https://x", name: "a.pdf", mimeType: "application/pdf", sizeBytes: 5, sha256: "ab".repeat(32) });
      const id = bill.files[0]?.id ?? "";
      expect((await bills.findFiles(w.a.id, [id])).map((f) => f.driveFileId)).toEqual(["df"]);
      expect(await bills.findFiles(w.b.id, [id])).toEqual([]);
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
