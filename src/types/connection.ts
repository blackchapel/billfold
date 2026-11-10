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
}
