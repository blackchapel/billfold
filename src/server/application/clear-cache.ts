import { CACHE_TAGS, type Cache } from "@/domain/ports/cache";
import type { AuditLogRepository, MemberRepository } from "@/domain/ports/repositories";
import type { AuthorizationService } from "./authorization";

/** The escape hatch: forget everything remembered about an organisation (its screens and its members' organisation lists). */
export class ClearCache {
  constructor(private readonly cache: Cache, private readonly members: MemberRepository, private readonly authz: AuthorizationService, private readonly audit: AuditLogRepository) {}

  async execute(input: { actorId: string; orgId: string }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "org.manage");
    await this.cache.bump(input.orgId, CACHE_TAGS);
    const people = await this.members.list(input.orgId);
    await this.cache.del(...people.map((m) => `orgs:${m.userId}`));
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "cache.cleared", entityType: "org", entityId: input.orgId, metadata: {} });
  }
}
