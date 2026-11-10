import { DomainError } from "@/domain/errors/domain-error";
import { can, effectivePermissions, type Permission } from "@/domain/policies/permissions";
import type { MemberRepository, OrgRepository } from "@/domain/ports/repositories";
import type { MembershipWithOrg } from "@/domain/ports/records";

/** The single place every server action asks "may this user do that in this org?". */
export class AuthorizationService {
  constructor(private readonly orgs: OrgRepository, private readonly members: MemberRepository) {}

  async membershipBySlug(userId: string, slug: string): Promise<MembershipWithOrg> {
    const membership = await this.orgs.findMembershipBySlug(userId, slug);
    // Same error for "no such org" and "not a member" so org existence is not leaked.
    if (!membership) throw new DomainError("not_found", "Organisation not found");
    return membership;
  }

  async require(userId: string, orgId: string, permission: Permission): Promise<void> {
    const member = await this.members.find(orgId, userId);
    if (!member) throw new DomainError("not_found", "Organisation not found");
    if (!can(member.role, member.overrides, permission)) {
      throw new DomainError("forbidden", `Missing permission ${permission}`);
    }
  }

  async permissionsFor(m: MembershipWithOrg): Promise<Permission[]> {
    return effectivePermissions(m.role, m.overrides);
  }
}
