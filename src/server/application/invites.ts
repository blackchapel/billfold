import { DomainError } from "@/domain/errors/domain-error";
import type { Role } from "@/domain/policies/permissions";
import type { AuditLogRepository, InviteRepository, MemberRepository, OrgRepository, UserRepository } from "@/domain/ports/repositories";
import type { Clock, InviteCodeService, RateLimiter } from "@/domain/ports/services";
import type { OrgRecord } from "@/domain/ports/records";
import type { AuthorizationService } from "./authorization";

export class CreateInvite {
  constructor(
    private readonly invites: InviteRepository,
    private readonly authz: AuthorizationService,
    private readonly codes: InviteCodeService,
    private readonly clock: Clock,
    private readonly audit: AuditLogRepository,
  ) {}

  /** Returns the plaintext code once; only its hash is stored. */
  async execute(input: { userId: string; orgId: string; role: Role; maxUses: number; expiresInDays: number }) {
    await this.authz.require(input.userId, input.orgId, "invites.manage");
    if (input.role === "owner") throw new DomainError("validation", "Invites cannot grant the owner role");
    if (input.maxUses < 1 || input.maxUses > 100) throw new DomainError("validation", "Max uses must be 1 to 100");
    if (input.expiresInDays < 1 || input.expiresInDays > 90) throw new DomainError("validation", "Expiry must be 1 to 90 days");
    const { code, hash } = this.codes.generate();
    const expiresAt = new Date(this.clock.now().getTime() + input.expiresInDays * 86_400_000);
    const invite = await this.invites.create({
      orgId: input.orgId, codeHash: hash, role: input.role, maxUses: input.maxUses, expiresAt, createdBy: input.userId,
    });
    await this.audit.record({ orgId: input.orgId, actorUserId: input.userId, action: "invite.created", entityType: "invite", entityId: invite.id });
    return { code, invite };
  }
}

export class RevokeInvite {
  constructor(
    private readonly invites: InviteRepository,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: { userId: string; orgId: string; inviteId: string }): Promise<void> {
    await this.authz.require(input.userId, input.orgId, "invites.manage");
    await this.invites.revoke(input.orgId, input.inviteId);
    await this.audit.record({ orgId: input.orgId, actorUserId: input.userId, action: "invite.revoked", entityType: "invite", entityId: input.inviteId });
  }
}

export class AcceptInvite {
  constructor(
    private readonly invites: InviteRepository,
    private readonly members: MemberRepository,
    private readonly orgs: OrgRepository,
    private readonly users: UserRepository,
    private readonly codes: InviteCodeService,
    private readonly clock: Clock,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditLogRepository,
  ) {}

  /** The caller is already signed in, so the allowlist has been checked by the sign-in gate. */
  async execute(input: { userId: string; code: string }): Promise<OrgRecord> {
    if (!(await this.limiter.allow(`invite:${input.userId}`, 10, 600))) {
      throw new DomainError("rate_limited", "Too many invite attempts");
    }
    const invite = await this.invites.findByCodeHash(this.codes.hash(input.code.trim()));
    if (!invite || invite.revokedAt) throw new DomainError("invite_invalid", "Invalid invite");
    const now = this.clock.now();
    if (invite.expiresAt <= now) throw new DomainError("invite_expired", "Invite expired");
    if (invite.useCount >= invite.maxUses) throw new DomainError("invite_exhausted", "Invite used up");

    const existing = await this.members.find(invite.orgId, input.userId);
    const org = (await this.orgs.listForUser(input.userId)).find((m) => m.orgId === invite.orgId)?.org;
    if (existing && org) return org;

    if (!(await this.invites.consume(invite.id, now))) throw new DomainError("invite_exhausted", "Invite used up");
    await this.members.add(invite.orgId, input.userId, invite.role);
    await this.users.setLastActiveOrg(input.userId, invite.orgId);
    await this.audit.record({ orgId: invite.orgId, actorUserId: input.userId, action: "invite.accepted", entityType: "invite", entityId: invite.id });
    const joined = (await this.orgs.listForUser(input.userId)).find((m) => m.orgId === invite.orgId);
    if (!joined) throw new DomainError("unexpected", "Membership missing after join");
    return joined.org;
  }
}
