import type { Role, PermissionOverrides } from "../policies/permissions";
import type {
  AllowlistEntry,
  InviteRecord,
  MemberRecord,
  MemberWithUser,
  MembershipWithOrg,
  OrgRecord,
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
