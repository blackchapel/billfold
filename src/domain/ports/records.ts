import type { PermissionOverrides, Role } from "../policies/permissions";
import type { PasswordMode } from "../value-objects/password-rule";
import type { PeriodMode } from "../value-objects/period";
import type { SourceMatcher } from "../value-objects/source-rules";
import type { ConnectionConfig, ConnectionKind, ConnectionStatus } from "../value-objects/connection";

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  lastActiveOrgId: string | null;
}

export interface OrgRecord {
  id: string;
  name: string;
  slug: string;
  defaultCurrency: string;
}

export interface MemberRecord {
  orgId: string;
  userId: string;
  role: Role;
  overrides: PermissionOverrides;
}

export interface MemberWithUser extends MemberRecord {
  email: string;
  name: string | null;
}

export interface MembershipWithOrg extends MemberRecord {
  org: OrgRecord;
}

export interface InviteRecord {
  id: string;
  orgId: string;
  codeHash: string;
  role: Role;
  maxUses: number;
  useCount: number;
  expiresAt: Date;
  revokedAt: Date | null;
  createdBy: string;
}

export interface AllowlistEntry {
  email: string;
  note: string | null;
  addedBy: string | null;
  createdAt: Date;
}

/** A linked external account. Never carries the secret; read that separately and only on the server. */
export interface ConnectionRecord {
  id: string;
  orgId: string;
  kind: ConnectionKind;
  label: string;
  accountEmail: string;
  config: ConnectionConfig;
  status: ConnectionStatus;
  lastCheckedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

export interface NewConnection {
  orgId: string;
  kind: ConnectionKind;
  label: string;
  accountEmail: string;
  config: ConnectionConfig;
  secretCiphertext: string;
  createdBy: string;
}

/** A rule set describing one kind of bill email. A static password is never part of this record. */
export interface SourceRecord {
  id: string;
  orgId: string;
  name: string;
  connectionId: string;
  matcher: SourceMatcher;
  passwordMode: PasswordMode;
  passwordPattern: string | null;
  hasStaticPassword: boolean;
  createdAt: Date;
}

export interface SourceFields {
  name: string;
  connectionId: string;
  matcher: SourceMatcher;
  passwordMode: PasswordMode;
  passwordPattern: string | null;
}

export interface RunConfigRecord {
  id: string;
  orgId: string;
  name: string;
  driveConnectionId: string;
  driveFolder: string;
  periodMode: PeriodMode;
  sourceIds: string[];
  createdAt: Date;
}

export interface RunConfigFields {
  name: string;
  driveConnectionId: string;
  driveFolder: string;
  periodMode: PeriodMode;
  sourceIds: string[];
}
