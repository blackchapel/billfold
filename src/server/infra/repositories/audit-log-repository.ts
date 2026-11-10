import { desc, eq } from "drizzle-orm";
import type { AuditLogRepository, AuditEntry } from "@/domain/ports/repositories";
import { redactObject } from "@/lib/redact";
import type { Db } from "../db/create";
import { auditLogs } from "../db/schema";

export class DrizzleAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: Db) {}

  async record(entry: AuditEntry) {
    await this.db.insert(auditLogs).values({ ...entry, metadata: redactObject(entry.metadata ?? {}) });
  }

  async list(orgId: string, limit: number) {
    const rows = await this.db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId)).orderBy(desc(auditLogs.createdAt)).limit(limit);
    return rows.map((r) => ({
      id: r.id, orgId: r.orgId, actorUserId: r.actorUserId, action: r.action, entityType: r.entityType,
      entityId: r.entityId, metadata: r.metadata, createdAt: r.createdAt,
    }));
  }
}
