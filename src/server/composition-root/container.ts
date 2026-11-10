import "server-only";
import { env, superAdminEmails } from "../infra/config/env";
import { db } from "../infra/db/client";
import { OrgSecretBox } from "../infra/crypto/org-secret-box";
import { HashedInviteCodes } from "../infra/crypto/invite-codes";
import { DrizzleAllowlistRepository } from "../infra/repositories/allowlist-repository";
import { DrizzleAuditLogRepository } from "../infra/repositories/audit-log-repository";
import { DrizzleInviteRepository } from "../infra/repositories/invite-repository";
import { DrizzleMemberRepository } from "../infra/repositories/member-repository";
import { DrizzleOrgRepository } from "../infra/repositories/org-repository";
import { PostgresRateLimiter } from "../infra/repositories/rate-limiter";
import { DrizzleUserRepository } from "../infra/repositories/user-repository";
import { ManageAllowlist } from "../application/allowlist";
import { AuthorizationService } from "../application/authorization";
import { CreateOrg } from "../application/create-org";
import { AcceptInvite, CreateInvite, RevokeInvite } from "../application/invites";
import { ChangeMemberRole, RemoveMember, SetMemberOverrides } from "../application/members";
import { SignInGate } from "../application/sign-in-gate";

const systemClock = { now: () => new Date() };

function build() {
  const database = db();
  const allowlist = new DrizzleAllowlistRepository(database);
  const users = new DrizzleUserRepository(database);
  const orgs = new DrizzleOrgRepository(database, env().MASTER_ENCRYPTION_KEY);
  const members = new DrizzleMemberRepository(database);
  const invites = new DrizzleInviteRepository(database);
  const audit = new DrizzleAuditLogRepository(database);
  const limiter = new PostgresRateLimiter(database);
  const codes = new HashedInviteCodes();
  const authz = new AuthorizationService(orgs, members);

  return {
    repos: { allowlist, users, orgs, members, invites, audit },
    secretBox: new OrgSecretBox(database, env().MASTER_ENCRYPTION_KEY),
    authz,
    signInGate: new SignInGate(allowlist, users, superAdminEmails()),
    createOrg: new CreateOrg(orgs, users, audit),
    createInvite: new CreateInvite(invites, authz, codes, systemClock, audit),
    revokeInvite: new RevokeInvite(invites, authz, audit),
    acceptInvite: new AcceptInvite(invites, members, orgs, users, codes, systemClock, limiter, audit),
    changeMemberRole: new ChangeMemberRole(members, authz, audit),
    setMemberOverrides: new SetMemberOverrides(members, authz, audit),
    removeMember: new RemoveMember(members, authz, audit),
    manageAllowlist: new ManageAllowlist(allowlist, audit),
  };
}

export type Container = ReturnType<typeof build>;

let instance: Container | null = null;

/** The only place concrete implementations are wired to ports. */
export function container(): Container {
  if (!instance) instance = build();
  return instance;
}
