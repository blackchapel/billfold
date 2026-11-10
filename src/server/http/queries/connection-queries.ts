import "server-only";
import { GOOGLE_KINDS, type GoogleKind } from "@/domain/value-objects/connection";
import type { ConnectionDto } from "@/types/connection";
import { container } from "../../composition-root/container";

export async function listConnections(orgId: string): Promise<ConnectionDto[]> {
  const records = await container().listConnections.execute(orgId);
  return records.map((r) => ({ id: r.id, kind: r.kind, label: r.label, accountEmail: r.accountEmail, status: r.status, lastCheckedAt: r.lastCheckedAt, lastError: r.lastError }));
}

/** Which Google connections the owner has finished setting up in Google Cloud. */
export function googleAvailability(): Record<GoogleKind, boolean> {
  const { google } = container();
  return Object.fromEntries(GOOGLE_KINDS.map((k) => [k, google.isConfigured(k)])) as Record<GoogleKind, boolean>;
}
