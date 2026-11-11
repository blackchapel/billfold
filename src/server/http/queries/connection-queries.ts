import "server-only";
import { GOOGLE_KINDS, hasFullDriveAccess, type GoogleKind } from "@/domain/value-objects/connection";
import type { ConnectionDto } from "@/types/connection";
import { container } from "../../composition-root/container";
import { connectionRecords } from "./request-memo";

export async function listConnections(orgId: string): Promise<ConnectionDto[]> {
  const records = await connectionRecords(orgId);
  return records.map((r) => ({ id: r.id, kind: r.kind, label: r.label, accountEmail: r.accountEmail, status: r.status, lastCheckedAt: r.lastCheckedAt, lastError: r.lastError, needsMorePermission: r.kind === "google_drive" && !hasFullDriveAccess(r.config) }));
}

/** Which Google connections the owner has finished setting up in Google Cloud. */
export function googleAvailability(): Record<GoogleKind, boolean> {
  const { google } = container();
  return Object.fromEntries(GOOGLE_KINDS.map((k) => [k, google.isConfigured(k)])) as Record<GoogleKind, boolean>;
}
