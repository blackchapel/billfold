import { DomainError } from "@/domain/errors/domain-error";
import type { AuditLogRepository, MemberRepository, OrgRepository } from "@/domain/ports/repositories";
import type { AuthorizationService } from "./authorization";

export class RenameOrg {
  constructor(private readonly orgs: OrgRepository, private readonly authz: AuthorizationService, private readonly audit: AuditLogRepository) {}

  async execute(input: { actorId: string; orgId: string; name: string }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "org.manage");
    const name = input.name.trim();
    if (name.length < 2 || name.length > 60) throw new DomainError("validation", "Name must be 2 to 60 characters");
    await this.orgs.rename(input.orgId, name);
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "org.renamed", entityType: "org", entityId: input.orgId, metadata: { name } });
  }
}

/** Makes another member the owner. The previous owner steps down to admin so there is still exactly one decision-maker. */
export class TransferOwnership {
  constructor(private readonly members: MemberRepository, private readonly authz: AuthorizationService, private readonly audit: AuditLogRepository) {}

  async execute(input: { actorId: string; orgId: string; newOwnerId: string }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "org.transfer");
    if (input.newOwnerId === input.actorId) throw new DomainError("validation", "Choose someone other than yourself.");
    const target = await this.members.find(input.orgId, input.newOwnerId);
    if (!target) throw new DomainError("not_found", "Member not found");
    await this.members.updateRole(input.orgId, input.newOwnerId, "owner");
    await this.members.updateRole(input.orgId, input.actorId, "admin");
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "org.ownership_transferred", entityType: "org", entityId: input.orgId, metadata: { newOwnerId: input.newOwnerId } });
  }
}

export class DeleteOrg {
  constructor(private readonly orgs: OrgRepository, private readonly authz: AuthorizationService, private readonly audit: AuditLogRepository) {}

  /** `confirmSlug` must equal the org's slug, so a stray click cannot delete an organisation. */
  async execute(input: { actorId: string; orgId: string; slug: string; confirmSlug: string }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "org.delete");
    if (input.confirmSlug.trim() !== input.slug) throw new DomainError("validation", "Type the organisation address exactly to confirm.");
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "org.deleted", entityType: "org", entityId: input.orgId });
    await this.orgs.softDeleteAndShred(input.orgId);
  }
}
