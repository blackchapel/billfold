import type { Role, PermissionOverrides } from "../policies/permissions";
import type { RunStatus } from "../value-objects/bill-data";
import type { ConnectionConfig, ConnectionKind, ConnectionStatus } from "../value-objects/connection";
import type {
  AllowlistEntry,
  BillFilter,
  BillPatch,
  BillFileRecord,
  BillRecord,
  ConnectionRecord,
  InviteRecord,
  MemberRecord,
  MemberWithUser,
  MembershipWithOrg,
  NewBill,
  NewBillFile,
  NewConnection,
  NewRunItem,
  NewSend,
  OrgRecord,
  RecipientRecord,
  RunConfigFields,
  RunConfigRecord,
  RunCounts,
  RunItemRecord,
  RunRecord,
  SendCounts,
  SendItemRecord,
  SendRecord,
  SendSummary,
  SendStatus,
  SourceFields,
  SourceRecord,
  TemplateRecord,
  UserRecord,
} from "./records";

export interface AllowlistRepository {
  isAllowed(email: string): Promise<boolean>;
  list(): Promise<AllowlistEntry[]>;
  add(email: string, addedBy: string, note: string | null): Promise<void>;
  remove(email: string): Promise<void>;
}

export interface UserRepository {
  upsert(user: Omit<UserRecord, "lastActiveOrgId">): Promise<UserRecord>;
  findById(id: string): Promise<UserRecord | null>;
  setLastActiveOrg(userId: string, orgId: string): Promise<void>;
  listAll(): Promise<UserRecord[]>;
}

export interface OrgRepository {
  /** Creates the org, its owner membership and its encryption key in one transaction. */
  createWithOwner(input: { name: string; slug: string; defaultCurrency: string; ownerId: string }): Promise<OrgRecord>;
  slugExists(slug: string): Promise<boolean>;
  listForUser(userId: string): Promise<MembershipWithOrg[]>;
  findMembershipBySlug(userId: string, slug: string): Promise<MembershipWithOrg | null>;
  listAll(): Promise<OrgRecord[]>;
  rename(orgId: string, name: string): Promise<void>;
  /** Hides the org and destroys its encryption keys (crypto-shredding), so stored secrets can never be read again. */
  softDeleteAndShred(orgId: string): Promise<void>;
}

export interface MemberRepository {
  find(orgId: string, userId: string): Promise<MemberRecord | null>;
  list(orgId: string): Promise<MemberWithUser[]>;
  add(orgId: string, userId: string, role: Role): Promise<void>;
  updateRole(orgId: string, userId: string, role: Role): Promise<void>;
  setOverrides(orgId: string, userId: string, overrides: PermissionOverrides): Promise<void>;
  remove(orgId: string, userId: string): Promise<void>;
  countOwners(orgId: string): Promise<number>;
}

export interface InviteRepository {
  create(invite: Omit<InviteRecord, "id" | "useCount" | "revokedAt">): Promise<InviteRecord>;
  findByCodeHash(codeHash: string): Promise<InviteRecord | null>;
  list(orgId: string): Promise<InviteRecord[]>;
  revoke(orgId: string, inviteId: string): Promise<void>;
  /** Atomically consumes one use; false if the invite is no longer usable. */
  consume(inviteId: string, now: Date): Promise<boolean>;
}

export interface AuditEntry {
  orgId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditLogRepository {
  record(entry: AuditEntry): Promise<void>;
  list(orgId: string, limit: number): Promise<(AuditEntry & { id: string; createdAt: Date })[]>;
}

export interface ConnectionRepository {
  create(connection: NewConnection): Promise<ConnectionRecord>;
  list(orgId: string): Promise<ConnectionRecord[]>;
  find(orgId: string, id: string): Promise<ConnectionRecord | null>;
  findByAccount(orgId: string, kind: ConnectionKind, accountEmail: string): Promise<ConnectionRecord | null>;
  /** The encrypted secret; only use cases that talk to the provider call this. */
  findSecret(orgId: string, id: string): Promise<string | null>;
  /** Stores a fresh secret (e.g. after reconnecting) and marks the connection healthy again. */
  /** Also replaces the non-secret settings when `config` is given (a reconnect records what Google granted this time). */
  replaceSecret(orgId: string, id: string, secretCiphertext: string, config?: ConnectionConfig): Promise<void>;
  /** Replaces the non-secret settings only (the secret and the health status are left alone). */
  setConfig(orgId: string, id: string, config: ConnectionConfig): Promise<void>;
  recordCheck(orgId: string, id: string, result: { status: ConnectionStatus; error: string | null; at: Date }): Promise<void>;
  remove(orgId: string, id: string): Promise<void>;
}

export interface SourceRepository {
  /** `passwordCiphertext` is the sealed static password, or null when the mode does not use one. */
  create(orgId: string, createdBy: string, fields: SourceFields, passwordCiphertext: string | null): Promise<SourceRecord>;
  /** `passwordCiphertext`: undefined keeps the stored one, null clears it, a string replaces it. */
  update(orgId: string, id: string, fields: SourceFields, passwordCiphertext: string | null | undefined): Promise<SourceRecord | null>;
  list(orgId: string): Promise<SourceRecord[]>;
  find(orgId: string, id: string): Promise<SourceRecord | null>;
  findMany(orgId: string, ids: string[]): Promise<SourceRecord[]>;
  findByName(orgId: string, name: string): Promise<SourceRecord | null>;
  findPasswordCiphertext(orgId: string, id: string): Promise<string | null>;
  remove(orgId: string, id: string): Promise<void>;
}

export interface RunConfigRepository {
  create(orgId: string, createdBy: string, fields: RunConfigFields): Promise<RunConfigRecord>;
  update(orgId: string, id: string, fields: RunConfigFields): Promise<RunConfigRecord | null>;
  list(orgId: string): Promise<RunConfigRecord[]>;
  find(orgId: string, id: string): Promise<RunConfigRecord | null>;
  findByName(orgId: string, name: string): Promise<RunConfigRecord | null>;
  remove(orgId: string, id: string): Promise<void>;
}

/** Which sources and run configs depend on a connection, so removing it cannot silently break them. */
export interface ConnectionUsage {
  namesUsing(orgId: string, connectionId: string): Promise<string[]>;
}

export interface RunRepository {
  create(orgId: string, run: { runConfigId: string; configName: string; periodKey: string; driveConnectionId: string; driveFolder: string; startedBy: string }): Promise<RunRecord>;
  find(orgId: string, id: string): Promise<RunRecord | null>;
  list(orgId: string, limit: number): Promise<RunRecord[]>;
  setStatus(orgId: string, id: string, status: RunStatus, finishedAt: Date | null): Promise<void>;
  counts(orgId: string, runIds: string[]): Promise<Map<string, RunCounts>>;
}

export interface RunItemRepository {
  insertMany(orgId: string, runId: string, items: NewRunItem[]): Promise<void>;
  list(orgId: string, runId: string): Promise<RunItemRecord[]>;
  find(orgId: string, id: string): Promise<RunItemRecord | null>;
  /**
   * Atomically takes the next pending item (or one stuck in "processing" since before `staleBefore`) and marks it
   * processing, so two requests can never work on the same item.
   */
  claimNext(orgId: string, runId: string, staleBefore: Date): Promise<RunItemRecord | null>;
  markDone(orgId: string, id: string, billId: string): Promise<void>;
  markFailed(orgId: string, id: string, error: string): Promise<void>;
  /** Failed items with fewer than `maxAttempts` tries go back to pending. Returns how many. `itemId` limits it to one. */
  retryFailed(orgId: string, runId: string, maxAttempts: number, itemId: string | null): Promise<number>;
  /** Pending items become skipped (used when a run is cancelled). Returns how many. */
  skipPending(orgId: string, runId: string, note: string): Promise<number>;
}

export interface BillRepository {
  /** The keys that already have a bill, each with whether that bill is deleted (a deleted bill still counts, so it is not filed again). */
  existingKeys(orgId: string, keys: string[]): Promise<Map<string, boolean>>;
  /** Deletes the bill and its file records for good, so its email can be filed again. The PDF in Google Drive is not touched. */
  remove(orgId: string, id: string): Promise<void>;
  /** Saves the bill and its Drive file together. */
  record(orgId: string, bill: NewBill, file: NewBillFile): Promise<BillRecord>;
  /** A bill typed in by hand: no email, no file. */
  createManual(orgId: string, bill: NewBill, file?: NewBillFile): Promise<BillRecord>;
  find(orgId: string, id: string): Promise<BillRecord | null>;
  list(orgId: string, filter: BillFilter): Promise<BillRecord[]>;
  /** Bills with these ids (files included), in no particular order. */
  findMany(orgId: string, ids: string[]): Promise<BillRecord[]>;
  /** Months that have bills (newest first) and how many bills need a check, from the database's own counting: nothing is loaded. */
  summary(orgId: string): Promise<{ months: string[]; needsReviewCount: number }>;
  /**
   * The bills a report is built from, without their files: every bill from `fromPeriod` on, plus every unpaid bill and every bill that
   * needs a check whatever its month. That is all the report maths reads, and it stays small however many years of bills pile up.
   */
  reportRows(orgId: string, fromPeriod: string): Promise<BillRecord[]>;
  /** The Drive copies with these ids, for attaching to an email. Other orgs' files are never returned. */
  findFiles(orgId: string, fileIds: string[]): Promise<BillFileRecord[]>;
  update(orgId: string, id: string, patch: BillPatch): Promise<BillRecord | null>;
}

export interface RecipientRepository {
  create(orgId: string, createdBy: string, fields: { name: string; email: string }): Promise<RecipientRecord>;
  update(orgId: string, id: string, fields: { name: string; email: string }): Promise<RecipientRecord | null>;
  list(orgId: string): Promise<RecipientRecord[]>;
  find(orgId: string, id: string): Promise<RecipientRecord | null>;
  findByEmail(orgId: string, email: string): Promise<RecipientRecord | null>;
  findMany(orgId: string, ids: string[]): Promise<RecipientRecord[]>;
  remove(orgId: string, id: string): Promise<void>;
}

export interface TemplateRepository {
  create(orgId: string, createdBy: string, fields: { name: string; subject: string; intro: string; signoff: string }): Promise<TemplateRecord>;
  update(orgId: string, id: string, fields: { name: string; subject: string; intro: string; signoff: string }): Promise<TemplateRecord | null>;
  list(orgId: string): Promise<TemplateRecord[]>;
  find(orgId: string, id: string): Promise<TemplateRecord | null>;
  findByName(orgId: string, name: string): Promise<TemplateRecord | null>;
  /** Makes this template the default and clears the flag on the others, or clears it everywhere with `null`. */
  setDefault(orgId: string, id: string | null): Promise<void>;
  remove(orgId: string, id: string): Promise<void>;
}

export interface SendRepository {
  create(orgId: string, send: NewSend): Promise<SendRecord>;
  find(orgId: string, id: string): Promise<SendRecord | null>;
  list(orgId: string, limit: number): Promise<SendSummary[]>;
  setStatus(orgId: string, id: string, status: SendStatus, finishedAt: Date | null): Promise<void>;
  counts(orgId: string, sendIds: string[]): Promise<Map<string, SendCounts>>;
  /** How many sends this person started since `since`, for the hourly limit. */
  countSince(orgId: string, userId: string, since: Date): Promise<number>;
}

export interface SendItemRepository {
  insertMany(orgId: string, sendId: string, items: { recipientName: string; recipientEmail: string }[]): Promise<void>;
  list(orgId: string, sendId: string): Promise<SendItemRecord[]>;
  find(orgId: string, id: string): Promise<SendItemRecord | null>;
  /** Atomically takes the next pending item (or one stuck in "processing" since before `staleBefore`), so two requests never send the same email twice. */
  claimNext(orgId: string, sendId: string, staleBefore: Date): Promise<SendItemRecord | null>;
  markSent(orgId: string, id: string, at: Date): Promise<void>;
  markFailed(orgId: string, id: string, error: string): Promise<void>;
  retryFailed(orgId: string, sendId: string, maxAttempts: number, itemId: string | null): Promise<number>;
  skipPending(orgId: string, sendId: string, note: string): Promise<number>;
}
