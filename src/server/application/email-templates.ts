import { DomainError } from "@/domain/errors/domain-error";
import type { AuditLogRepository, TemplateRepository } from "@/domain/ports/repositories";
import type { TemplateRecord } from "@/domain/ports/records";
import { SEND_LIMITS, unknownPlaceholders } from "@/domain/value-objects/email-template";
import type { AuthorizationService } from "./authorization";

export interface TemplateInput { name: string; subject: string; intro: string; signoff: string }

function validate(input: TemplateInput): TemplateInput {
  const name = input.name.trim();
  const subject = input.subject.replace(/[\r\n]+/g, " ").trim();
  if (name.length < 2 || name.length > 60) throw new DomainError("validation", "Name must be 2 to 60 characters");
  if (subject.length < 1 || subject.length > SEND_LIMITS.subjectMax) throw new DomainError("validation", `The subject must be 1 to ${SEND_LIMITS.subjectMax} characters.`);
  if (input.intro.length > SEND_LIMITS.introMax) throw new DomainError("validation", `The opening text can be at most ${SEND_LIMITS.introMax} characters.`);
  if (input.signoff.length > SEND_LIMITS.signoffMax) throw new DomainError("validation", `The closing text can be at most ${SEND_LIMITS.signoffMax} characters.`);
  const unknown = unknownPlaceholders(`${subject}\n${input.intro}\n${input.signoff}`);
  if (unknown.length > 0) throw new DomainError("validation", `Unknown placeholder${unknown.length > 1 ? "s" : ""}: ${unknown.map((u) => `{{${u}}}`).join(", ")}. Check the spelling against the list below the form.`);
  return { name, subject, intro: input.intro.trim(), signoff: input.signoff.trim() };
}

export class SaveTemplate {
  constructor(private readonly templates: TemplateRepository, private readonly authz: AuthorizationService, private readonly audit: AuditLogRepository) {}

  async execute(input: { actorId: string; orgId: string; id?: string } & TemplateInput): Promise<TemplateRecord> {
    await this.authz.require(input.actorId, input.orgId, "templates.manage");
    const fields = validate(input);
    const clash = await this.templates.findByName(input.orgId, fields.name);
    if (clash && clash.id !== input.id) throw new DomainError("validation", "A template with that name already exists.");
    let record: TemplateRecord | null;
    if (input.id) {
      if (!(await this.templates.find(input.orgId, input.id))) throw new DomainError("not_found", "Template not found");
      record = await this.templates.update(input.orgId, input.id, fields);
    } else {
      record = await this.templates.create(input.orgId, input.actorId, fields);
    }
    if (!record) throw new DomainError("not_found", "Template not found");
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: input.id ? "template.updated" : "template.created", entityType: "template", entityId: record.id, metadata: { name: fields.name } });
    return record;
  }
}

export class SetDefaultTemplate {
  constructor(private readonly templates: TemplateRepository, private readonly authz: AuthorizationService, private readonly audit: AuditLogRepository) {}

  /** `templateId` null goes back to the built-in wording. */
  async execute(input: { actorId: string; orgId: string; templateId: string | null }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "templates.manage");
    if (input.templateId && !(await this.templates.find(input.orgId, input.templateId))) throw new DomainError("not_found", "Template not found");
    await this.templates.setDefault(input.orgId, input.templateId);
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "template.default_set", entityType: "template", entityId: input.templateId, metadata: {} });
  }
}

export class DeleteTemplate {
  constructor(private readonly templates: TemplateRepository, private readonly authz: AuthorizationService, private readonly audit: AuditLogRepository) {}

  async execute(input: { actorId: string; orgId: string; templateId: string }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "templates.manage");
    const template = await this.templates.find(input.orgId, input.templateId);
    if (!template) throw new DomainError("not_found", "Template not found");
    await this.templates.remove(input.orgId, template.id); // past sends keep their finished text
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "template.deleted", entityType: "template", entityId: template.id, metadata: { name: template.name } });
  }
}

export class ListTemplates {
  constructor(private readonly templates: TemplateRepository) {}
  execute(orgId: string): Promise<TemplateRecord[]> { return this.templates.list(orgId); }
  find(orgId: string, id: string): Promise<TemplateRecord | null> { return this.templates.find(orgId, id); }
}
