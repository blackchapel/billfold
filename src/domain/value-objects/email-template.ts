/** The words a template may use between double curly brackets, e.g. "Bills for {{month}}". */
export const TEMPLATE_PLACEHOLDERS = ["month", "org", "total", "bill_count", "unpaid_total", "sender", "from_name"] as const;
export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];

export const PLACEHOLDER_HELP: Record<TemplatePlaceholder, string> = {
  month: "the month, e.g. October 2026",
  org: "the organisation name",
  total: "the total of the bills, e.g. ₹12,345.00",
  bill_count: "how many bills",
  unpaid_total: "the part not marked paid yet",
  sender: "the name of the person pressing Send",
  from_name: "the name set on the mail account you send from (falls back to the sender)",
};

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/gi;

/** Placeholders that are not in the allowed list, so a typo is caught when the template is saved, not in someone's inbox. */
export function unknownPlaceholders(text: string): string[] {
  const names = [...text.matchAll(PLACEHOLDER)].map((m) => (m[1] as string).toLowerCase());
  return [...new Set(names.filter((n) => !(TEMPLATE_PLACEHOLDERS as readonly string[]).includes(n)))];
}

/** Plain find-and-replace. Never evaluates anything; values are inserted as text and escaped later where HTML is built. */
export function fillPlaceholders(text: string, values: Record<TemplatePlaceholder, string>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => values[name.toLowerCase() as TemplatePlaceholder] ?? whole);
}

export interface EmailTemplateFields { name: string; subject: string; intro: string; signoff: string }

/** Offered when an organisation has written no template of its own, so sending works from day one. */
export const BUILT_IN_TEMPLATE: EmailTemplateFields = {
  name: "Standard summary",
  subject: "Bills for {{month}}: {{total}} across {{bill_count}} bills",
  intro: "Hello,\n\nHere are the bills for {{month}}. The PDFs are attached.",
  signoff: "Regards,\n{{from_name}}",
};

export const SEND_LIMITS = {
  maxRecipients: 25,
  maxAttachments: 40,
  /** Gmail and most mail servers refuse messages over about 25 MB once encoded; stay well under. */
  maxAttachmentBytes: 18 * 1024 * 1024,
  subjectMax: 150,
  introMax: 2000,
  signoffMax: 500,
} as const;
