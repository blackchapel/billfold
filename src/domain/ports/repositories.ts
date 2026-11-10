import type { Role, PermissionOverrides } from "../policies/permissions";
import type { RunStatus } from "../value-objects/bill-data";
import type { ConnectionKind, ConnectionStatus } from "../value-objects/connection";
import type {
  AllowlistEntry,
  BillFilter,
  BillPatch,
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
  OrgRecord,
  RunConfigFields,
  RunConfigRecord,
  RunCounts,
  RunItemRecord,
  RunRecord,
  SourceFields,
  SourceRecord,
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
  replaceSecret(orgId: string, id: string, secretCiphertext: string): Promise<void>;
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
  /** Which of these keys already have a bill (deleted ones included, so a deleted bill is not filed again). */
  existingKeys(orgId: string, keys: string[]): Promise<Set<string>>;
  /** Saves the bill and its Drive file together. */
  record(orgId: string, bill: NewBill, file: NewBillFile): Promise<BillRecord>;
  /** A bill typed in by hand: no email, no file. */
  createManual(orgId: string, bill: NewBill): Promise<BillRecord>;
  find(orgId: string, id: string): Promise<BillRecord | null>;
  list(orgId: string, filter: BillFilter): Promise<BillRecord[]>;
  update(orgId: string, id: string, patch: BillPatch): Promise<BillRecord | null>;
}
