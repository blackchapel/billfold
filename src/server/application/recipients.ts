import { DomainError } from "@/domain/errors/domain-error";
import type { AuditLogRepository, RecipientRepository } from "@/domain/ports/repositories";
import type { RecipientRecord } from "@/domain/ports/records";
import { normalizeEmail } from "@/domain/value-objects/email-address";
import type { AuthorizationService } from "./authorization";

export const MAX_RECIPIENTS_PER_ORG = 200;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Adds or edits someone who can receive summaries. A name and an address; the address is stored in lower case. */
export class SaveRecipient {
  constructor(private readonly recipients: RecipientRepository, private readonly authz: AuthorizationService, private readonly audit: AuditLogRepository) {}

  async execute(input: { actorId: string; orgId: string; id?: string; name: string; email: string }): Promise<RecipientRecord> {
    await this.authz.require(input.actorId, input.orgId, "recipients.manage");
    const name = input.name.trim();
    if (name.length < 1 || name.length > 80 || CONTROL.test(name)) throw new DomainError("validation", "Name must be 1 to 80 characters, on one line.");
    const email = normalizeEmail(input.email);
    if (!email) throw new DomainError("validation", "Enter a valid email address.");
    const clash = await this.recipients.findByEmail(input.orgId, email);
    if (clash && clash.id !== input.id) throw new DomainError("validation", "Someone with that email address is already in the list.");

    let record: RecipientRecord | null;
    if (input.id) {
      if (!(await this.recipients.find(input.orgId, input.id))) throw new DomainError("not_found", "Recipient not found");
      record = await this.recipients.update(input.orgId, input.id, { name, email });
    } else {
      if ((await this.recipients.list(input.orgId)).length >= MAX_RECIPIENTS_PER_ORG) throw new DomainError("validation", `A list can hold at most ${MAX_RECIPIENTS_PER_ORG} people.`);
      record = await this.recipients.create(input.orgId, input.actorId, { name, email });
    }
    if (!record) throw new DomainError("not_found", "Recipient not found");
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: input.id ? "recipient.updated" : "recipient.added", entityType: "recipient", entityId: record.id, metadata: { name } });
    return record;
  }
}

export class DeleteRecipient {
  constructor(private readonly recipients: RecipientRepository, private readonly authz: AuthorizationService, private readonly audit: AuditLogRepository) {}

  async execute(input: { actorId: string; orgId: string; recipientId: string }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "recipients.manage");
    const recipient = await this.recipients.find(input.orgId, input.recipientId);
    if (!recipient) throw new DomainError("not_found", "Recipient not found");
    await this.recipients.remove(input.orgId, recipient.id); // sent emails keep the name and address they went to
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "recipient.removed", entityType: "recipient", entityId: recipient.id, metadata: { name: recipient.name } });
  }
}

/** Anyone in the organisation can see who is on the list. */
export class ListRecipients {
  constructor(private readonly recipients: RecipientRepository) {}
  execute(orgId: string): Promise<RecipientRecord[]> { return this.recipients.list(orgId); }
}
