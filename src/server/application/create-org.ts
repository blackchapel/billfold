import { ORG_SLUG_PATTERN, RESERVED_SLUGS } from "@/constants/app";
import { DomainError } from "@/domain/errors/domain-error";
import { slugify } from "@/lib/slug";
import type { AuditLogRepository, OrgRepository, UserRepository } from "@/domain/ports/repositories";
import type { OrgRecord } from "@/domain/ports/records";

export class CreateOrg {
  constructor(
    private readonly orgs: OrgRepository,
    private readonly users: UserRepository,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: { userId: string; name: string; defaultCurrency: string }): Promise<OrgRecord> {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 60) throw new DomainError("validation", "Name must be 2 to 60 characters");
    const base = (RESERVED_SLUGS as readonly string[]).includes(slugify(name)) ? `${slugify(name)}-org` : slugify(name);
    let slug = base;
    if (!ORG_SLUG_PATTERN.test(slug)) throw new DomainError("validation", "Name needs letters or numbers");
    for (let i = 2; await this.orgs.slugExists(slug); i++) slug = `${base}-${i}`.slice(0, 40);

    const org = await this.orgs.createWithOwner({
      name,
      slug,
      defaultCurrency: input.defaultCurrency,
      ownerId: input.userId,
    });
    await this.users.setLastActiveOrg(input.userId, org.id);
    await this.audit.record({ orgId: org.id, actorUserId: input.userId, action: "org.created", entityType: "org", entityId: org.id });
    return org;
  }
}
