import "server-only";
import { INR } from "@/domain/value-objects/currency";
import { PLACEHOLDER_HELP, TEMPLATE_PLACEHOLDERS, BUILT_IN_TEMPLATE } from "@/domain/value-objects/email-template";
import type { SendCounts, SendItemRecord, SendSummary } from "@/domain/ports/records";
import { formatMoney } from "@/lib/format-money";
import type { ComposeOptions, PlaceholderDto, PreviewDto, RecipientDto, SendDetailDto, SendItemDto, SendSummaryDto, TemplateDto } from "@/types/send";
import type { Composed } from "../../application/send-composer";
import { MAX_SEND_ATTEMPTS } from "../../application/sends";
import { container } from "../../composition-root/container";
import { billSummary, connectionRecords, recipientRecords, templateRecords } from "./request-memo";
import { cachedRead } from "./cached";

export async function listRecipientDtos(orgId: string): Promise<RecipientDto[]> {
  return (await recipientRecords(orgId)).map((r) => ({ id: r.id, name: r.name, email: r.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listTemplateDtos(orgId: string): Promise<TemplateDto[]> {
  return (await templateRecords(orgId)).map((t) => ({ id: t.id, name: t.name, subject: t.subject, intro: t.intro, signoff: t.signoff, isDefault: t.isDefault }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function placeholderHelp(): PlaceholderDto[] {
  return TEMPLATE_PLACEHOLDERS.map((name) => ({ name, help: PLACEHOLDER_HELP[name] }));
}

export const builtInTemplate = (): Omit<TemplateDto, "id" | "isDefault"> => ({ ...BUILT_IN_TEMPLATE });

export async function composeOptions(orgId: string): Promise<ComposeOptions> {
  const [summary, templates, recipients, connections] = await Promise.all([
    billSummary(orgId), listTemplateDtos(orgId), listRecipientDtos(orgId), connectionRecords(orgId),
  ]);
  return {
    periods: summary.months,
    templates: templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault })),
    recipients,
    senders: connections.filter((x) => x.kind === "gmail" || x.kind === "smtp").map((x) => ({ id: x.id, label: x.label, account: x.accountEmail, healthy: x.status === "active" })),
    defaultTemplateName: templates.find((t) => t.isDefault)?.name ?? BUILT_IN_TEMPLATE.name,
  };
}

export function toPreviewDto(p: Composed): PreviewDto {
  return {
    subject: p.email.subject, html: p.email.html, billCount: p.billCount, templateName: p.templateName,
    totalText: formatMoney({ minor: p.totalMinor, currency: INR }),
    attachments: p.files.map((f) => ({ name: f.name })), attachmentMegabytes: (p.attachmentBytes / 1048576).toFixed(1), warnings: p.warnings, from: p.from,
  };
}

export const toSendItemDto = (i: SendItemRecord): SendItemDto => ({
  id: i.id, recipientName: i.recipientName, recipientEmail: i.recipientEmail, status: i.status, error: i.error, attempts: i.attempts,
  canRetry: i.status === "failed" && i.attempts < MAX_SEND_ATTEMPTS, sentAt: i.sentAt?.toISOString() ?? null,
});

function summary(send: SendSummary, counts: SendCounts): SendSummaryDto {
  return {
    id: send.id, periodKey: send.periodKey, subject: send.subject, status: send.status, isTest: send.isTest, billCount: send.billCount,
    totalText: formatMoney({ minor: send.totalMinor, currency: INR }), fromAccount: send.fromAccount, createdAt: send.createdAt.toISOString(), counts,
  };
}

export async function listSendSummaries(orgId: string): Promise<SendSummaryDto[]> {
  return (await cachedRead(orgId, "sends", ["sends"], null, () => container().readSends.list(orgId))).map(({ send, counts }) => summary(send, counts));
}

/** Whether a real (not test) summary has ever been sent, for the Overview checklist. */
export async function hasSentSummary(orgId: string): Promise<boolean> {
  return (await cachedRead(orgId, "sendsRecent", ["sends"], null, () => container().readSends.recent(orgId))).some((s) => !s.isTest);
}

export async function getSendDetail(orgId: string, sendId: string): Promise<SendDetailDto | null> {
  const detail = await container().readSends.get(orgId, sendId);
  if (!detail) return null;
  return { ...summary(detail.send, detail.counts), templateName: detail.send.templateName, attachmentCount: detail.send.attachmentFileIds.length, bodyHtml: detail.send.bodyHtml, items: detail.items.map(toSendItemDto) };
}

