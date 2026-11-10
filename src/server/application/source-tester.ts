import { DomainError } from "@/domain/errors/domain-error";
import type { ConnectionRepository } from "@/domain/ports/repositories";
import type { Clock, MailSearch, SecretBox } from "@/domain/ports/services";
import { extractSubjectPassword, redactSubjectPassword } from "@/domain/value-objects/password-rule";
import { extractAddress, matchesMessage } from "@/domain/value-objects/source-rules";
import type { AuthorizationService } from "./authorization";
import { validateSourceFields, type SourceInput } from "./sources";

export interface TesterMatch {
  from: string;
  /** The subject with any password part masked. */
  subject: string;
  date: Date;
  attachments: string[];
  /** For subject-based password modes: was a password found? null for other modes. Never the password itself. */
  passwordFound: boolean | null;
}

export interface TesterResult {
  windowDays: number;
  scanned: number;
  matches: TesterMatch[];
}

const SCAN_LIMIT = 100;
const SHOW_LIMIT = 20;

/** Dry run of a source's rules against the real mailbox. Reads headers only; nothing is downloaded or saved. */
export class TestSource {
  constructor(
    private readonly connections: ConnectionRepository,
    private readonly authz: AuthorizationService,
    private readonly secrets: SecretBox,
    private readonly search: MailSearch,
    private readonly clock: Clock,
  ) {}

  async execute(input: Omit<SourceInput, "id" | "staticPassword"> & { windowDays: number }): Promise<TesterResult> {
    await this.authz.require(input.actorId, input.orgId, "sources.manage");
    const fields = validateSourceFields({ ...input, staticPassword: null });
    const windowDays = Math.min(Math.max(Math.trunc(input.windowDays) || 90, 1), 365);
    const mailbox = await this.connections.find(input.orgId, input.connectionId);
    const cipher = mailbox ? await this.connections.findSecret(input.orgId, mailbox.id) : null;
    if (!mailbox || !cipher || (mailbox.kind !== "gmail" && mailbox.kind !== "imap")) throw new DomainError("validation", "Choose a connected Gmail or IMAP mailbox to read from.");

    const before = this.clock.now();
    const since = new Date(before.getTime() - windowDays * 86_400_000);
    let found;
    try {
      found = await this.search.search({
        kind: mailbox.kind, config: mailbox.config, secretJson: await this.secrets.decrypt(input.orgId, cipher),
        matcher: fields.matcher, since, before, limit: SCAN_LIMIT,
      });
    } catch {
      throw new DomainError("validation", "Could not read the mailbox. Test the connection on the Connections page first.");
    }
    const matching = found.filter((m) => matchesMessage(fields.matcher, m)).sort((a, b) => b.date.getTime() - a.date.getTime());
    const subjectBased = fields.passwordMode === "subject_brackets" || fields.passwordMode === "subject_pattern";
    return {
      windowDays,
      scanned: found.length,
      matches: matching.slice(0, SHOW_LIMIT).map((m) => ({
        from: extractAddress(m.from),
        subject: redactSubjectPassword(fields.passwordMode, fields.passwordPattern, m.subject),
        date: m.date,
        attachments: m.attachments.map((a) => a.name),
        passwordFound: subjectBased ? extractSubjectPassword(fields.passwordMode, fields.passwordPattern, m.subject) !== null : null,
      })),
    };
  }
}
