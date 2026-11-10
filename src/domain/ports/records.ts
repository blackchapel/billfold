import type { PermissionOverrides, Role } from "../policies/permissions";
import type { Confidence, RunItemStatus, RunStatus } from "../value-objects/bill-data";
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

export interface RunRecord {
  id: string;
  orgId: string;
  runConfigId: string | null;
  configName: string;
  periodKey: string;
  /** Null once the Drive connection has been removed. */
  driveConnectionId: string | null;
  driveFolder: string;
  status: RunStatus;
  startedBy: string;
  createdAt: Date;
  finishedAt: Date | null;
}

export interface RunCounts { pending: number; processing: number; done: number; failed: number; skipped: number }

/** One email (or one PDF in it) a run has to file. The subject is stored with any password already masked. */
export interface RunItemRecord {
  id: string;
  runId: string;
  orgId: string;
  sourceId: string | null;
  sourceName: string;
  messageId: string;
  messageDate: Date;
  fromAddress: string;
  subject: string;
  attachmentName: string | null;
  itemKey: string;
  status: RunItemStatus;
  error: string | null;
  attempts: number;
  billId: string | null;
}

export interface NewRunItem {
  sourceId: string;
  sourceName: string;
  messageId: string;
  messageDate: Date;
  fromAddress: string;
  subject: string;
  attachmentName: string | null;
  /** Identifies the email+attachment inside a source, so the same one is never filed twice. */
  itemKey: string;
  status: Extract<RunItemStatus, "pending" | "skipped" | "failed">;
  error: string | null;
}

export interface NewBill {
  periodKey: string;
  sourceId: string | null;
  sourceName: string;
  billerName: string;
  amountMinor: bigint | null;
  currency: string;
  billDate: string | null;
  dueDate: string | null;
  confidence: Confidence;
  /** How the numbers got here: read by the text reader, by Gemini, or typed in by a person. */
  method: "text" | "gemini" | "manual";
  needsReview: boolean;
  note: string | null;
  messageKey: string;
  createdBy: string;
}

export interface NewBillFile {
  driveConnectionId: string;
  driveAccount: string;
  driveFileId: string;
  driveFolderId: string;
  webViewLink: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

/** Drive connection and source can disappear later (set null); the account and source names stay on the record. */
export type BillFileRecord = Omit<NewBillFile, "driveConnectionId"> & { id: string; driveConnectionId: string | null };

export interface BillRecord extends Omit<NewBill, "createdBy" | "sourceId"> {
  id: string;
  orgId: string;
  /** Null for bills typed in by hand, or once the source was deleted. */
  sourceId: string | null;
  reviewedAt: Date | null;
  paidAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  files: BillFileRecord[];
}

/** The parts of a bill a person may change, plus its review, paid and deleted marks. Absent keys stay as they are. */
export interface BillPatch {
  billerName?: string;
  amountMinor?: bigint | null;
  periodKey?: string;
  billDate?: string | null;
  dueDate?: string | null;
  note?: string | null;
  needsReview?: boolean;
  reviewedAt?: Date | null;
  reviewedBy?: string | null;
  paidAt?: Date | null;
  deletedAt?: Date | null;
  deletedBy?: string | null;
}

export interface BillFilter {
  periodKey?: string | null;
  fromPeriod?: string | null;
  toPeriod?: string | null;
  needsReview?: boolean;
  unpaid?: boolean;
  /** Matches the biller or source name, ignoring case. */
  search?: string | null;
  /** Deleted bills are left out unless asked for. */
  deleted?: "exclude" | "only";
}

export interface RecipientRecord { id: string; orgId: string; name: string; email: string; createdAt: Date }

export interface TemplateRecord { id: string; orgId: string; name: string; subject: string; intro: string; signoff: string; isDefault: boolean }

export type SendStatus = "sending" | "sent" | "sent_with_errors" | "failed" | "cancelled";
export type SendItemStatus = "pending" | "processing" | "sent" | "failed" | "skipped";

/** One "send summary" action, with the finished message exactly as it went out. */
export interface SendRecord {
  id: string;
  orgId: string;
  periodKey: string;
  templateName: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  fromConnectionId: string | null;
  fromAccount: string;
  /** `bill_files` ids whose PDFs are attached. */
  attachmentFileIds: string[];
  attachmentBytes: number;
  billCount: number;
  totalMinor: bigint;
  isTest: boolean;
  status: SendStatus;
  createdBy: string;
  createdAt: Date;
  finishedAt: Date | null;
}

export type NewSend = Omit<SendRecord, "id" | "orgId" | "status" | "createdAt" | "finishedAt">;

export interface SendItemRecord {
  id: string;
  sendId: string;
  orgId: string;
  recipientName: string;
  recipientEmail: string;
  status: SendItemStatus;
  error: string | null;
  attempts: number;
  sentAt: Date | null;
}

export interface SendCounts { pending: number; processing: number; sent: number; failed: number; skipped: number }
