import { DomainError } from "@/domain/errors/domain-error";
import { normalizeEmail } from "@/domain/value-objects/email-address";
import type { AllowlistRepository, AuditLogRepository } from "@/domain/ports/repositories";

/** Super-admin-only allowlist management. Callers must pass isSuperAdmin from the session. */
export class ManageAllowlist {
  constructor(private readonly allowlist: AllowlistRepository, private readonly audit: AuditLogRepository) {}

  private guard(isSuperAdmin: boolean) {
    if (!isSuperAdmin) throw new DomainError("forbidden", "Super admin only");
  }

  async add(input: { actorId: string; isSuperAdmin: boolean; email: string; note: string | null }): Promise<void> {
    this.guard(input.isSuperAdmin);
    const email = normalizeEmail(input.email);
    if (!email) throw new DomainError("validation", "Enter a valid email address");
    await this.allowlist.add(email, input.actorId, input.note?.trim() || null);
    await this.audit.record({ orgId: null, actorUserId: input.actorId, action: "allowlist.added", entityType: "allowlist", entityId: email });
  }

  async remove(input: { actorId: string; isSuperAdmin: boolean; email: string }): Promise<void> {
    this.guard(input.isSuperAdmin);
    const email = normalizeEmail(input.email);
    if (!email) throw new DomainError("validation", "Enter a valid email address");
    await this.allowlist.remove(email);
    await this.audit.record({ orgId: null, actorUserId: input.actorId, action: "allowlist.removed", entityType: "allowlist", entityId: email });
  }
}
