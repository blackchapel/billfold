import { randomUUID } from "node:crypto";
import type { PermissionOverrides, Role } from "@/domain/policies/permissions";
import type { AuditEntry } from "@/domain/ports/repositories";
import type { AllowlistRepository, AuditLogRepository, InviteRepository, MemberRepository, OrgRepository, UserRepository } from "@/domain/ports/repositories";
import type { InviteRecord, MemberRecord, MembershipWithOrg, OrgRecord, UserRecord } from "@/domain/ports/records";
import type { Clock, ConnectionProbe, GoogleOAuthClient, InviteCodeService, ProbeResult, RateLimiter, SecretBox } from "@/domain/ports/services";
import type { RecipientRepository, TemplateRepository, SendRepository, SendItemRepository, BillRepository, ConnectionRepository, ConnectionUsage, RunConfigRepository, RunItemRepository, RunRepository, SourceRepository } from "@/domain/ports/repositories";
import type { MessageSummary } from "@/domain/value-objects/source-rules";
import type { RecipientRecord, TemplateRecord, SendRecord, SendItemRecord, SendCounts, BillRecord, ConnectionRecord, RunConfigRecord, RunCounts, RunItemRecord, RunRecord, SourceRecord } from "@/domain/ports/records";
import type { DriveStore, DriveUploadInput, FetchedMessage, MailSender, OutgoingEmail, MailFetch, MailFetchInput, MailSearch, MailSearchInput } from "@/domain/ports/services";

export class Memory {
  allowed = new Set<string>();
  users = new Map<string, UserRecord>();
  orgs = new Map<string, OrgRecord>();
  members: MemberRecord[] = [];
  invites = new Map<string, InviteRecord>();
  audit: AuditEntry[] = [];
  now = new Date("2026-11-01T00:00:00Z");
  limitAllows = true;
  connections = new Map<string, ConnectionRecord & { secret: string }>();
  probeResult: ProbeResult = { ok: true, message: "ok" };
  probed: { kind: string; secretJson: string }[] = [];
  sources = new Map<string, SourceRecord & { cipher: string | null }>();
  runConfigs = new Map<string, RunConfigRecord>();
  mailbox: MessageSummary[] = [];
  searchFails = false;
  searched: MailSearchInput[] = [];
  runs = new Map<string, RunRecord>();
  runItems = new Map<string, RunItemRecord>();
  bills = new Map<string, BillRecord>();
  /** What the fake mailbox returns when an email is downloaded, by message id. An Error value makes the download fail. */
  emails = new Map<string, FetchedMessage | Error>();
  fetched: MailFetchInput[] = [];
  uploads: DriveUploadInput[] = [];
  uploadFails = false;
  revoked: string[] = [];
  revokeFails = false;
  googleAccount = { refreshToken: "refresh-1", accountEmail: "drive@example.com" };

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
    rename: async (id, name) => { const o = this.orgs.get(id); if (o) o.name = name; },
    softDeleteAndShred: async (id) => { this.orgs.delete(id); this.members = this.members.filter((m) => m.orgId !== id); },
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
  connectionRepo: ConnectionRepository = {
    create: async (c) => {
      const r: ConnectionRecord = { id: randomUUID(), orgId: c.orgId, kind: c.kind, label: c.label, accountEmail: c.accountEmail, config: c.config, status: "active", lastCheckedAt: null, lastError: null, createdAt: this.now };
      this.connections.set(r.id, { ...r, secret: c.secretCiphertext });
      return r;
    },
    list: async (o) => [...this.connections.values()].filter((c) => c.orgId === o).map((c) => this.publicView(c)),
    find: async (o, id) => { const c = this.connections.get(id); return c && c.orgId === o ? this.publicView(c) : null; },
    findByAccount: async (o, k, e) => { const c = [...this.connections.values()].find((x) => x.orgId === o && x.kind === k && x.accountEmail === e); return c ? this.publicView(c) : null; },
    findSecret: async (o, id) => { const c = this.connections.get(id); return c && c.orgId === o ? c.secret : null; },
    replaceSecret: async (o, id, secret) => { const c = this.connections.get(id); if (c && c.orgId === o) { c.secret = secret; c.status = "active"; c.lastError = null; } },
    recordCheck: async (o, id, r) => { const c = this.connections.get(id); if (c && c.orgId === o) { c.status = r.status; c.lastError = r.error; c.lastCheckedAt = r.at; } },
    remove: async (o, id) => { const c = this.connections.get(id); if (c && c.orgId === o) this.connections.delete(id); },
  };
  private publicView(c: ConnectionRecord & { secret: string }): ConnectionRecord {
    return { id: c.id, orgId: c.orgId, kind: c.kind, label: c.label, accountEmail: c.accountEmail, config: c.config, status: c.status, lastCheckedAt: c.lastCheckedAt, lastError: c.lastError, createdAt: c.createdAt };
  }
  /** Reversible stand-in for encryption that is still obviously not plaintext. */
  secretBox: SecretBox = { encrypt: async (o, t) => `enc:${o}:${Buffer.from(t).toString("base64")}`, decrypt: async (_o, c) => Buffer.from(c.split(":")[2] ?? "", "base64").toString() };
  probe: ConnectionProbe = { check: async (kind, _config, secretJson) => { this.probed.push({ kind, secretJson }); return this.probeResult; } };
  google: GoogleOAuthClient = {
    isConfigured: () => true,
    authorizeUrl: (k, state) => `https://google.test/auth?k=${k}&state=${state}`,
    exchangeCode: async () => this.googleAccount,
    accessToken: async () => "access",
    revoke: async (_k, token) => { if (this.revokeFails) throw new Error("offline"); this.revoked.push(token); },
  };
  private sourceView(x: SourceRecord & { cipher: string | null }): SourceRecord {
    return { id: x.id, orgId: x.orgId, name: x.name, connectionId: x.connectionId, matcher: x.matcher, passwordMode: x.passwordMode, passwordPattern: x.passwordPattern, hasStaticPassword: x.cipher !== null, createdAt: x.createdAt };
  }
  sourceRepo: SourceRepository = {
    create: async (orgId, _by, f, cipher) => { const r = { id: randomUUID(), orgId, ...f, hasStaticPassword: cipher !== null, createdAt: this.now, cipher }; this.sources.set(r.id, r); return this.sourceView(r); },
    update: async (orgId, id, f, cipher) => { const r = this.sources.get(id); if (!r || r.orgId !== orgId) return null; Object.assign(r, f); if (cipher !== undefined) r.cipher = cipher; return this.sourceView(r); },
    list: async (o) => [...this.sources.values()].filter((x) => x.orgId === o).map((x) => this.sourceView(x)),
    find: async (o, id) => { const r = this.sources.get(id); return r && r.orgId === o ? this.sourceView(r) : null; },
    findMany: async (o, ids) => [...this.sources.values()].filter((x) => x.orgId === o && ids.includes(x.id)).map((x) => this.sourceView(x)),
    findByName: async (o, n) => { const r = [...this.sources.values()].find((x) => x.orgId === o && x.name.toLowerCase() === n.toLowerCase()); return r ? this.sourceView(r) : null; },
    findPasswordCiphertext: async (o, id) => { const r = this.sources.get(id); return r && r.orgId === o ? r.cipher : null; },
    remove: async (o, id) => { const r = this.sources.get(id); if (r && r.orgId === o) { this.sources.delete(id); for (const rc of this.runConfigs.values()) rc.sourceIds = rc.sourceIds.filter((s) => s !== id); } },
  };
  runConfigRepo: RunConfigRepository = {
    create: async (orgId, _by, f) => { const r = { id: randomUUID(), orgId, ...f, createdAt: this.now }; this.runConfigs.set(r.id, r); return r; },
    update: async (orgId, id, f) => { const r = this.runConfigs.get(id); if (!r || r.orgId !== orgId) return null; Object.assign(r, f); return r; },
    list: async (o) => [...this.runConfigs.values()].filter((x) => x.orgId === o),
    find: async (o, id) => { const r = this.runConfigs.get(id); return r && r.orgId === o ? r : null; },
    findByName: async (o, n) => [...this.runConfigs.values()].find((x) => x.orgId === o && x.name.toLowerCase() === n.toLowerCase()) ?? null,
    remove: async (o, id) => { const r = this.runConfigs.get(id); if (r && r.orgId === o) this.runConfigs.delete(id); },
  };
  usage: ConnectionUsage = {
    namesUsing: async (o, id) => [
      ...[...this.sources.values()].filter((x) => x.orgId === o && x.connectionId === id).map((x) => `source "${x.name}"`),
      ...[...this.runConfigs.values()].filter((x) => x.orgId === o && x.driveConnectionId === id).map((x) => `run config "${x.name}"`),
    ],
  };
  mailSearch: MailSearch = {
    search: async (input) => { this.searched.push(input); if (this.searchFails) throw new Error("imap exploded: user=a pass=hunter2"); return this.mailbox; },
  };
  runRepo: RunRepository = {
    create: async (orgId, r) => { const run: RunRecord = { id: randomUUID(), orgId, ...r, status: "processing", createdAt: this.now, finishedAt: null }; this.runs.set(run.id, run); return { ...run }; },
    find: async (o, id) => { const r = this.runs.get(id); return r && r.orgId === o ? { ...r } : null; },
    list: async (o, limit) => [...this.runs.values()].filter((r) => r.orgId === o).slice(-limit).reverse(),
    setStatus: async (o, id, status, finishedAt) => { const r = this.runs.get(id); if (r && r.orgId === o) { r.status = status; r.finishedAt = finishedAt; } },
    counts: async (o, ids) => {
      const out = new Map<string, RunCounts>();
      for (const id of ids) {
        const c: RunCounts = { pending: 0, processing: 0, done: 0, failed: 0, skipped: 0 };
        for (const i of this.runItems.values()) if (i.runId === id && i.orgId === o) c[i.status]++;
        out.set(id, c);
      }
      return out;
    },
  };
  /** Only items older than this many ms count as abandoned: mirrors the 5 minute rule in the use case. */
  private claimTimes = new Map<string, Date>();
  runItemRepo: RunItemRepository = {
    insertMany: async (orgId, runId, items) => {
      for (const i of items) {
        if ([...this.runItems.values()].some((x) => x.runId === runId && x.itemKey === i.itemKey)) continue; // unique (run, key)
        const rec: RunItemRecord = { id: randomUUID(), runId, orgId, sourceId: i.sourceId, sourceName: i.sourceName, messageId: i.messageId, messageDate: i.messageDate, fromAddress: i.fromAddress, subject: i.subject, attachmentName: i.attachmentName, itemKey: i.itemKey, status: i.status, error: i.error, attempts: 0, billId: null };
        this.runItems.set(rec.id, rec);
      }
    },
    list: async (o, runId) => [...this.runItems.values()].filter((i) => i.runId === runId && i.orgId === o),
    find: async (o, id) => { const i = this.runItems.get(id); return i && i.orgId === o ? { ...i } : null; },
    claimNext: async (o, runId, staleBefore) => {
      const next = [...this.runItems.values()].find((i) => i.runId === runId && i.orgId === o && (i.status === "pending" || (i.status === "processing" && (this.claimTimes.get(i.id) ?? this.now) < staleBefore)));
      if (!next) return null;
      next.status = "processing"; next.attempts++; this.claimTimes.set(next.id, this.now);
      return { ...next };
    },
    markDone: async (o, id, billId) => { const i = this.runItems.get(id); if (i && i.orgId === o) { i.status = "done"; i.billId = billId; i.error = null; } },
    markFailed: async (o, id, error) => { const i = this.runItems.get(id); if (i && i.orgId === o) { i.status = "failed"; i.error = error; } },
    retryFailed: async (o, runId, max, itemId) => {
      let n = 0;
      for (const i of this.runItems.values()) if (i.runId === runId && i.orgId === o && i.status === "failed" && i.attempts < max && (!itemId || i.id === itemId)) { i.status = "pending"; i.error = null; n++; }
      return n;
    },
    skipPending: async (o, runId, note) => { let n = 0; for (const i of this.runItems.values()) if (i.runId === runId && i.orgId === o && i.status === "pending") { i.status = "skipped"; i.error = note; n++; } return n; },
  };
  billRepo: BillRepository = {
    existingKeys: async (o, keys) => new Set([...this.bills.values()].filter((b) => b.orgId === o && keys.includes(b.messageKey)).map((b) => b.messageKey)),
    record: async (orgId, bill, file) => {
      if ([...this.bills.values()].some((b) => b.orgId === orgId && b.messageKey === bill.messageKey)) throw new Error("duplicate key value violates unique constraint");
      const rec: BillRecord = { ...bill, id: randomUUID(), orgId, reviewedAt: null, paidAt: null, deletedAt: null, createdAt: this.now, files: [{ ...file, id: randomUUID() }] };
      this.bills.set(rec.id, rec);
      return rec;
    },
    createManual: async (orgId, bill) => {
      const rec: BillRecord = { ...bill, id: randomUUID(), orgId, reviewedAt: null, paidAt: null, deletedAt: null, createdAt: this.now, files: [] };
      this.bills.set(rec.id, rec);
      return { ...rec };
    },
    find: async (o, id) => { const b = this.bills.get(id); return b && b.orgId === o ? { ...b } : null; },
    list: async (o, f) => [...this.bills.values()].filter((b) =>
      b.orgId === o && (!f.periodKey || b.periodKey === f.periodKey) && (!f.fromPeriod || b.periodKey >= f.fromPeriod) && (!f.toPeriod || b.periodKey <= f.toPeriod)
      && (!f.needsReview || b.needsReview) && (!f.unpaid || !b.paidAt)
      && (!f.search?.trim() || `${b.billerName}\n${b.sourceName}`.toLowerCase().includes(f.search.trim().toLowerCase()))
      && (f.deleted === "only" ? b.deletedAt !== null : b.deletedAt === null)).map((b) => ({ ...b })),
    findFiles: async (o, ids) => [...this.bills.values()].filter((b) => b.orgId === o).flatMap((b) => b.files).filter((f) => ids.includes(f.id)),
    update: async (o, id, patch) => {
      const b = this.bills.get(id);
      if (!b || b.orgId !== o) return null;
      Object.assign(b, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
      return { ...b };
    },
  };
  recipients = new Map<string, RecipientRecord>();
  recipientRepo: RecipientRepository = {
    create: async (orgId, _by, f) => { const r = { id: randomUUID(), orgId, name: f.name, email: f.email, createdAt: this.now }; this.recipients.set(r.id, r); return { ...r }; },
    update: async (o, id, f) => { const r = this.recipients.get(id); if (!r || r.orgId !== o) return null; Object.assign(r, f); return { ...r }; },
    list: async (o) => [...this.recipients.values()].filter((r) => r.orgId === o).map((r) => ({ ...r })),
    find: async (o, id) => { const r = this.recipients.get(id); return r && r.orgId === o ? { ...r } : null; },
    findByEmail: async (o, email) => { const r = [...this.recipients.values()].find((x) => x.orgId === o && x.email.toLowerCase() === email.toLowerCase()); return r ? { ...r } : null; },
    findMany: async (o, ids) => [...this.recipients.values()].filter((r) => r.orgId === o && ids.includes(r.id)).map((r) => ({ ...r })),
    remove: async (o, id) => { const r = this.recipients.get(id); if (r && r.orgId === o) this.recipients.delete(id); },
  };
  templates = new Map<string, TemplateRecord>();
  templateRepo: TemplateRepository = {
    create: async (orgId, _by, f) => { const t = { id: randomUUID(), orgId, ...f, isDefault: false }; this.templates.set(t.id, t); return { ...t }; },
    update: async (o, id, f) => { const t = this.templates.get(id); if (!t || t.orgId !== o) return null; Object.assign(t, f); return { ...t }; },
    list: async (o) => [...this.templates.values()].filter((t) => t.orgId === o).map((t) => ({ ...t })),
    find: async (o, id) => { const t = this.templates.get(id); return t && t.orgId === o ? { ...t } : null; },
    findByName: async (o, name) => { const t = [...this.templates.values()].find((x) => x.orgId === o && x.name.toLowerCase() === name.toLowerCase()); return t ? { ...t } : null; },
    setDefault: async (o, id) => { for (const t of this.templates.values()) if (t.orgId === o) t.isDefault = t.id === id; },
    remove: async (o, id) => { const t = this.templates.get(id); if (t && t.orgId === o) this.templates.delete(id); },
  };
  sendRows = new Map<string, SendRecord>();
  sendItems = new Map<string, SendItemRecord>();
  private sendClaims = new Map<string, Date>();
  private sendsStarted: { orgId: string; userId: string; at: Date }[] = [];
  sendRepo: SendRepository = {
    create: async (orgId, s) => { const r: SendRecord = { ...s, id: randomUUID(), orgId, status: "sending", createdAt: this.now, finishedAt: null }; this.sendRows.set(r.id, r); this.sendsStarted.push({ orgId, userId: s.createdBy, at: this.now }); return { ...r }; },
    find: async (o, id) => { const r = this.sendRows.get(id); return r && r.orgId === o ? { ...r } : null; },
    list: async (o, limit) => [...this.sendRows.values()].filter((r) => r.orgId === o).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit).map((r) => ({ ...r })),
    setStatus: async (o, id, status, at) => { const r = this.sendRows.get(id); if (r && r.orgId === o) { r.status = status; r.finishedAt = at; } },
    counts: async (o, ids) => {
      const out = new Map<string, SendCounts>();
      for (const id of ids) {
        const c: SendCounts = { pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 };
        for (const i of this.sendItems.values()) if (i.sendId === id && i.orgId === o) c[i.status]++;
        out.set(id, c);
      }
      return out;
    },
    countSince: async (o, u, since) => this.sendsStarted.filter((s) => s.orgId === o && s.userId === u && s.at >= since).length,
  };
  sendItemRepo: SendItemRepository = {
    insertMany: async (orgId, sendId, items) => {
      for (const i of items) {
        if ([...this.sendItems.values()].some((x) => x.sendId === sendId && x.recipientEmail.toLowerCase() === i.recipientEmail.toLowerCase())) continue;
        const r: SendItemRecord = { id: randomUUID(), sendId, orgId, recipientName: i.recipientName, recipientEmail: i.recipientEmail, status: "pending", error: null, attempts: 0, sentAt: null };
        this.sendItems.set(r.id, r);
      }
    },
    list: async (o, sendId) => [...this.sendItems.values()].filter((i) => i.sendId === sendId && i.orgId === o).map((i) => ({ ...i })),
    find: async (o, id) => { const i = this.sendItems.get(id); return i && i.orgId === o ? { ...i } : null; },
    claimNext: async (o, sendId, staleBefore) => {
      const next = [...this.sendItems.values()].find((i) => i.sendId === sendId && i.orgId === o && (i.status === "pending" || (i.status === "processing" && (this.sendClaims.get(i.id) ?? this.now) < staleBefore)));
      if (!next) return null;
      next.status = "processing"; next.attempts++; this.sendClaims.set(next.id, this.now);
      return { ...next };
    },
    markSent: async (o, id, at) => { const i = this.sendItems.get(id); if (i && i.orgId === o) { i.status = "sent"; i.sentAt = at; i.error = null; } },
    markFailed: async (o, id, error) => { const i = this.sendItems.get(id); if (i && i.orgId === o) { i.status = "failed"; i.error = error; } },
    retryFailed: async (o, sendId, max, itemId) => { let n = 0; for (const i of this.sendItems.values()) if (i.sendId === sendId && i.orgId === o && i.status === "failed" && i.attempts < max && (!itemId || i.id === itemId)) { i.status = "pending"; i.error = null; n++; } return n; },
    skipPending: async (o, sendId, note) => { let n = 0; for (const i of this.sendItems.values()) if (i.sendId === sendId && i.orgId === o && i.status === "pending") { i.status = "skipped"; i.error = note; n++; } return n; },
  };
  mailFetch: MailFetch = {
    fetch: async (input) => {
      this.fetched.push(input);
      const hit = this.emails.get(input.messageId);
      if (!hit) throw new Error("not in the fake mailbox");
      if (hit instanceof Error) throw hit;
      return hit;
    },
  };
  /** Emails the fake "sent": filled by `mailSender`. A recipient listed in `refusedRecipients` makes the send fail. */
  outbox: OutgoingEmail[] = [];
  refusedRecipients = new Set<string>();
  downloadSizes = new Map<string, number>();
  mailSender: MailSender = {
    send: async (email) => {
      if (this.refusedRecipients.has(email.to.email)) throw new Error(`550 refused ${email.to.email} password=SECRET-PW`);
      this.outbox.push(email);
    },
  };
  driveStore: DriveStore = {
    download: async ({ fileId, maxBytes }) => {
      const size = this.downloadSizes.get(fileId) ?? 10;
      if (size > maxBytes) throw new Error("File too large");
      return new Uint8Array(size).fill(0x25);
    },
    upload: async (input) => {
      if (this.uploadFails) throw new Error("Drive request failed: 500 token=SECRET-TOKEN");
      this.uploads.push(input);
      return { fileId: `file-${this.uploads.length}`, folderId: `folder-${input.folderPath.join("/")}`, webViewLink: `https://drive.test/${this.uploads.length}` };
    },
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
