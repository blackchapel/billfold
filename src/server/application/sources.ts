import { DomainError } from "@/domain/errors/domain-error";
import type { AuditLogRepository, ConnectionRepository, SourceRepository } from "@/domain/ports/repositories";
import type { SourceFields, SourceRecord } from "@/domain/ports/records";
import type { SecretBox } from "@/domain/ports/services";
import { fileTemplateProblem, folderTemplateProblem } from "@/lib/name-template";
import { PASSWORD_MODES, validatePasswordPattern, type PasswordMode } from "@/domain/value-objects/password-rule";
import { parseSender } from "@/domain/value-objects/source-rules";
import type { AuthorizationService } from "./authorization";

export interface SourceInput {
  actorId: string;
  orgId: string;
  /** Present when editing. */
  id?: string;
  name: string;
  connectionId: string;
  senders: string[];
  subjectContains: string | null;
  attachmentNameContains: string | null;
  requireAttachment: boolean;
  passwordMode: PasswordMode;
  passwordPattern: string | null;
  /** The PDF password for mode "static". Blank when editing keeps the saved one. */
  staticPassword: string | null;
  /** How filed PDFs are named, e.g. "phone-bill-{{Mon}}{{yy}}". Blank keeps the built-in name. */
  fileNameTemplate?: string | null;
  /** Where filed PDFs go, from the top of Drive, e.g. "bills/{{Mon}}{{yy}}". Blank keeps the built-in layout. */
  folderTemplate?: string | null;
}

const clean = (value: string | null, max: number, label: string): string | null => {
  const v = value?.trim() ?? "";
  if (v.length > max) throw new DomainError("validation", `${label} can be at most ${max} characters.`);
  return v || null;
};

/** Checks everything that does not need the database, and returns the normalised fields. */
export function validateSourceFields(input: SourceInput): SourceFields {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) throw new DomainError("validation", "Name must be 2 to 60 characters");
  const senders = [...new Set(input.senders.map((s) => s.trim()).filter(Boolean).map((s) => {
    const parsed = parseSender(s);
    if (!parsed) throw new DomainError("validation", `"${s.slice(0, 60)}" is not an email address or a domain like jio.com.`);
    return parsed;
  }))];
  if (senders.length === 0) throw new DomainError("validation", "Add at least one sender, such as billing@example.com or example.com.");
  if (senders.length > 10) throw new DomainError("validation", "Use at most 10 senders per source.");
  if (!(PASSWORD_MODES as readonly string[]).includes(input.passwordMode)) throw new DomainError("validation", "Choose how to open the PDF.");
  let passwordPattern: string | null = null;
  if (input.passwordMode === "subject_pattern") {
    passwordPattern = input.passwordPattern?.trim() ?? "";
    const problem = validatePasswordPattern(passwordPattern);
    if (problem) throw new DomainError("validation", problem);
  }
  const fileNameTemplate = input.fileNameTemplate?.trim() || null;
  const folderTemplate = input.folderTemplate?.trim() || null;
  const fileProblem = fileNameTemplate ? fileTemplateProblem(fileNameTemplate) : null;
  if (fileProblem) throw new DomainError("validation", fileProblem);
  const folderProblem = folderTemplate ? folderTemplateProblem(folderTemplate) : null;
  if (folderProblem) throw new DomainError("validation", folderProblem);
  return {
    name,
    connectionId: input.connectionId,
    matcher: {
      senders,
      subjectContains: clean(input.subjectContains, 100, "The subject text"),
      attachmentNameContains: clean(input.attachmentNameContains, 60, "The attachment name text"),
      requireAttachment: input.requireAttachment,
    },
    passwordMode: input.passwordMode,
    passwordPattern,
    fileNameTemplate,
    folderTemplate,
  };
}

/** Creates or edits a source. The mailbox must be a Gmail or IMAP connection of the same org. */
export class SaveSource {
  constructor(
    private readonly sources: SourceRepository,
    private readonly connections: ConnectionRepository,
    private readonly authz: AuthorizationService,
    private readonly secrets: SecretBox,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: SourceInput): Promise<SourceRecord> {
    await this.authz.require(input.actorId, input.orgId, "sources.manage");
    const fields = validateSourceFields(input);
    const mailbox = await this.connections.find(input.orgId, input.connectionId);
    if (!mailbox || (mailbox.kind !== "gmail" && mailbox.kind !== "imap")) throw new DomainError("validation", "Choose a connected Gmail or IMAP mailbox to read from.");
    const clash = await this.sources.findByName(input.orgId, fields.name);
    if (clash && clash.id !== input.id) throw new DomainError("validation", "A source with that name already exists.");

    const existing = input.id ? await this.sources.find(input.orgId, input.id) : null;
    if (input.id && !existing) throw new DomainError("not_found", "Source not found");
    const cipher = await this.passwordCipher(input, existing);

    const record = existing
      ? await this.sources.update(input.orgId, existing.id, fields, cipher)
      : await this.sources.create(input.orgId, input.actorId, fields, cipher ?? null);
    if (!record) throw new DomainError("not_found", "Source not found");
    await this.audit.record({
      orgId: input.orgId, actorUserId: input.actorId, action: existing ? "source.updated" : "source.created", entityType: "source", entityId: record.id,
      metadata: { name: fields.name, passwordMode: fields.passwordMode },
    });
    return record;
  }

  /** undefined = keep the saved password, null = none, string = sealed new password. */
  private async passwordCipher(input: SourceInput, existing: SourceRecord | null): Promise<string | null | undefined> {
    if (input.passwordMode !== "static") return existing ? null : undefined;
    const typed = input.staticPassword ?? "";
    if (typed) return this.secrets.encrypt(input.orgId, typed);
    if (existing?.hasStaticPassword) return undefined;
    throw new DomainError("validation", "Enter the PDF password for this source.");
  }
}

export class DeleteSource {
  constructor(private readonly sources: SourceRepository, private readonly authz: AuthorizationService, private readonly audit: AuditLogRepository) {}

  async execute(input: { actorId: string; orgId: string; sourceId: string }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "sources.manage");
    const source = await this.sources.find(input.orgId, input.sourceId);
    if (!source) throw new DomainError("not_found", "Source not found");
    await this.sources.remove(input.orgId, source.id);
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "source.deleted", entityType: "source", entityId: source.id, metadata: { name: source.name } });
  }
}

/** Any member may read source rules (never the password); only managers change them. */
export class ListSources {
  constructor(private readonly sources: SourceRepository) {}
  execute(orgId: string): Promise<SourceRecord[]> { return this.sources.list(orgId); }
  find(orgId: string, id: string): Promise<SourceRecord | null> { return this.sources.find(orgId, id); }
}
