import type { ConnectionKind, ConnectionStatus } from "@/domain/value-objects/connection";

/** What the UI is allowed to know about a connection. There is deliberately no secret field. */
export interface ConnectionDto {
  id: string;
  kind: ConnectionKind;
  label: string;
  accountEmail: string;
  status: ConnectionStatus;
  lastCheckedAt: Date | null;
  lastError: string | null;
  /** A Google Drive connected before full Drive access was asked for: it works, but cannot use folders that already exist. */
  needsMorePermission: boolean;
  /** "Name on this account" for Gmail and SMTP connections; empty when not set. */
  senderName: string;
}
