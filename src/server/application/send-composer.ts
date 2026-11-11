import { periodLabel } from "@/constants/runs";
import { DomainError } from "@/domain/errors/domain-error";
import type { BillRepository, ConnectionRepository, OrgRepository, TemplateRepository, UserRepository } from "@/domain/ports/repositories";
import type { BillFileRecord, BillRecord } from "@/domain/ports/records";
import { connectionSenderName, fromDisplayName } from "@/domain/value-objects/connection";
import { INR, currencyByCode } from "@/domain/value-objects/currency";
import { BUILT_IN_TEMPLATE, SEND_LIMITS, fillPlaceholders, type EmailTemplateFields } from "@/domain/value-objects/email-template";
import { Money } from "@/domain/value-objects/money";
import { renderSummaryEmail, type RenderedEmail } from "@/domain/value-objects/summary-email";
import { formatMoney } from "@/lib/format-money";

export interface ComposeInput { actorId: string; orgId: string; periodKey: string; templateId: string | null; attachPdfs: boolean; /** The account the email goes out from; fills {{from_name}}. */ connectionId?: string | null }

export interface Composed {
  email: RenderedEmail;
  templateName: string;
  billCount: number;
  totalMinor: bigint;
  /** Files that will be attached, and files left out with the reason, so the screen can say so. */
  files: BillFileRecord[];
  attachmentBytes: number;
  warnings: string[];
  /** How the sender will appear in the inbox; null until an account is chosen. */
  from: { name: string; address: string } | null;
}

/** Builds the finished message for a month: pure reads, shared by the preview and the real send so they can never differ. */
export class SendComposer {
  constructor(
    private readonly bills: BillRepository,
    private readonly templates: TemplateRepository,
    private readonly orgs: OrgRepository,
    private readonly users: UserRepository,
    private readonly connections: ConnectionRepository,
  ) {}

  async compose(input: ComposeInput): Promise<Composed> {
    const org = (await this.orgs.listAll()).find((o) => o.id === input.orgId);
    if (!org) throw new DomainError("not_found", "Organisation not found");
    const sender = await this.users.findById(input.actorId);
    const from = input.connectionId ? await this.connections.find(input.orgId, input.connectionId) : null;
    const template = await this.pickTemplate(input.orgId, input.templateId);
    const bills = (await this.bills.list(input.orgId, { periodKey: input.periodKey, deleted: "exclude" }));
    if (bills.length === 0) throw new DomainError("validation", `There are no bills for ${periodLabel(input.periodKey)} to send.`);

    const currency = currencyByCode(org.defaultCurrency) ?? INR;
    const money = (minor: bigint) => formatMoney(Money.ofMinor(minor, currency));
    const total = bills.reduce((t, b) => t + (b.amountMinor ?? 0n), 0n);
    const unpaid = bills.filter((b) => b.paidAt === null).reduce((t, b) => t + (b.amountMinor ?? 0n), 0n);
    const warnings: string[] = [];
    const unreviewed = bills.filter((b) => b.needsReview).length;
    if (unreviewed > 0) warnings.push(`${unreviewed} ${unreviewed === 1 ? "bill still needs" : "bills still need"} a check, so the amount may be wrong.`);
    const unknown = bills.filter((b) => b.amountMinor === null).length;
    if (unknown > 0) warnings.push(`${unknown} ${unknown === 1 ? "bill has" : "bills have"} no amount and will show as "not known".`);

    const { files, attachmentBytes, note } = input.attachPdfs ? this.pickFiles(bills) : { files: [], attachmentBytes: 0, note: null };
    if (note) warnings.push(note);

    const values = {
      month: periodLabel(input.periodKey), org: org.name, total: money(total), bill_count: String(bills.length),
      unpaid_total: money(unpaid), sender: sender?.name?.trim() || sender?.email || org.name,
      from_name: "",
    };
    // The name set on the sending account; when none was set, the person pressing Send, so the sign-off is never blank.
    values.from_name = (from && (from.kind === "gmail" || from.kind === "smtp") ? connectionSenderName(from.config) : "") || values.sender;
    const email = renderSummaryEmail({
      orgName: org.name, periodLabel: values.month, subject: fillPlaceholders(template.subject, values),
      intro: fillPlaceholders(template.intro, values), signoff: fillPlaceholders(template.signoff, values),
      bills: bills.map((b) => ({
        biller: b.billerName, amountText: b.amountMinor === null ? null : money(b.amountMinor), paid: b.paidAt !== null,
        dueText: b.dueDate,
      })),
      totalText: values.total, unpaidText: values.unpaid_total, attachmentNames: files.map((f) => f.name),
    });
    return { email, templateName: template.name, billCount: bills.length, totalMinor: total, files, attachmentBytes, warnings,
      from: from && (from.kind === "gmail" || from.kind === "smtp") ? { name: fromDisplayName(from.config, sender?.name, from.accountEmail), address: from.accountEmail } : null };
  }

  private async pickTemplate(orgId: string, id: string | null): Promise<EmailTemplateFields> {
    if (id) {
      const found = await this.templates.find(orgId, id);
      if (!found) throw new DomainError("not_found", "Template not found");
      return found;
    }
    return (await this.templates.list(orgId)).find((t) => t.isDefault) ?? BUILT_IN_TEMPLATE;
  }

  /** The first file of every bill, as long as the total stays under the mail size limit; otherwise nothing is attached and the screen says why. */
  private pickFiles(bills: BillRecord[]): { files: BillFileRecord[]; attachmentBytes: number; note: string | null } {
    const files = bills.flatMap((b) => b.files.slice(0, 1));
    const bytes = files.reduce((t, f) => t + f.sizeBytes, 0);
    if (files.length > SEND_LIMITS.maxAttachments) return { files: [], attachmentBytes: 0, note: `There are ${files.length} PDFs, more than the ${SEND_LIMITS.maxAttachments} one email can carry, so none are attached.` };
    if (bytes > SEND_LIMITS.maxAttachmentBytes) return { files: [], attachmentBytes: 0, note: `The PDFs add up to ${(bytes / 1048576).toFixed(1)} MB, over the ${SEND_LIMITS.maxAttachmentBytes / 1048576} MB an email can carry, so none are attached. The Drive links are in the Bills page.` };
    return { files, attachmentBytes: bytes, note: null };
  }
}

