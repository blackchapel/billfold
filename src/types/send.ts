export interface RecipientDto { id: string; name: string; email: string }

export interface TemplateDto { id: string; name: string; subject: string; intro: string; signoff: string; isDefault: boolean }

export interface PlaceholderDto { name: string; help: string }

export interface SendCountsDto { pending: number; processing: number; sent: number; failed: number; skipped: number }

export interface SendSummaryDto {
  id: string;
  periodKey: string;
  subject: string;
  status: string;
  isTest: boolean;
  billCount: number;
  totalText: string;
  fromAccount: string;
  createdAt: string;
  counts: SendCountsDto;
}

export interface SendItemDto {
  id: string;
  recipientName: string;
  recipientEmail: string;
  status: string;
  error: string | null;
  attempts: number;
  canRetry: boolean;
  sentAt: string | null;
}

export interface SendDetailDto extends SendSummaryDto {
  templateName: string;
  attachmentCount: number;
  bodyHtml: string;
  items: SendItemDto[];
}

export interface SendStepDto { status: string; counts: SendCountsDto; finished: boolean; item: SendItemDto | null }

export interface ComposeOptions {
  /** Months that have bills, newest first. */
  periods: string[];
  templates: { id: string; name: string; isDefault: boolean }[];
  recipients: RecipientDto[];
  /** Gmail and SMTP connections the email can be sent from. */
  senders: { id: string; label: string; account: string; healthy: boolean }[];
  /** Name of the wording used when "Default" is chosen. */
  defaultTemplateName: string;
}

export interface PreviewDto {
  subject: string;
  html: string;
  billCount: number;
  totalText: string;
  templateName: string;
  attachments: { name: string }[];
  attachmentMegabytes: string;
  warnings: string[];
}
