import { DomainError } from "@/domain/errors/domain-error";
import type { PermissionOverrides, Role } from "@/domain/policies/permissions";
import type { AuditLogRepository, MemberRepository } from "@/domain/ports/repositories";
import type { AuthorizationService } from "./authorization";

export class ChangeMemberRole {
  constructor(
    private readonly members: MemberRepository,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: { actorId: string; orgId: string; targetUserId: string; role: Role }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "members.manage");
    const actor = await this.members.find(input.orgId, input.actorId);
    const target = await this.members.find(input.orgId, input.targetUserId);
    if (!target) throw new DomainError("not_found", "Member not found");
    // Only owners may touch the owner role (grant it or take it away).
    if ((input.role === "owner" || target.role === "owner") && actor?.role !== "owner") {
      throw new DomainError("forbidden", "Only an owner can change owner roles");
    }
    if (target.role === "owner" && input.role !== "owner" && (await this.members.countOwners(input.orgId)) <= 1) {
      throw new DomainError("last_owner", "Cannot demote the last owner");
    }
    await this.members.updateRole(input.orgId, input.targetUserId, input.role);
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "member.role_changed", entityType: "member", entityId: input.targetUserId, metadata: { role: input.role } });
  }
}

export class SetMemberOverrides {
  constructor(
    private readonly members: MemberRepository,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: { actorId: string; orgId: string; targetUserId: string; overrides: PermissionOverrides }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "members.manage");
    const target = await this.members.find(input.orgId, input.targetUserId);
    if (!target) throw new DomainError("not_found", "Member not found");
    if (target.role === "owner") throw new DomainError("validation", "Owner permissions cannot be overridden");
    await this.members.setOverrides(input.orgId, input.targetUserId, input.overrides);
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "member.overrides_changed", entityType: "member", entityId: input.targetUserId, metadata: { overrides: input.overrides } });
  }
}

export class RemoveMember {
  constructor(
    private readonly members: MemberRepository,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: { actorId: string; orgId: string; targetUserId: string }): Promise<void> {
    const leavingSelf = input.actorId === input.targetUserId;
    if (!leavingSelf) await this.authz.require(input.actorId, input.orgId, "members.manage");
    const target = await this.members.find(input.orgId, input.targetUserId);
    if (!target) throw new DomainError("not_found", "Member not found");
    if (target.role === "owner" && (await this.members.countOwners(input.orgId)) <= 1) {
      throw new DomainError("last_owner", "Cannot remove the last owner");
    }
    await this.members.remove(input.orgId, input.targetUserId);
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "member.removed", entityType: "member", entityId: input.targetUserId });
  }
}
