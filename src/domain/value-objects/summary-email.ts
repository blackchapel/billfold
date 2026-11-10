import { SEND_LIMITS } from "./email-template";

export interface SummaryBill { biller: string; amountText: string | null; dueText: string | null; paid: boolean; note: string | null }

export interface SummaryEmailInput {
  orgName: string;
  periodLabel: string;
  subject: string;
  /** Plain text, may contain line breaks. */
  intro: string;
  signoff: string;
  bills: SummaryBill[];
  totalText: string;
  unpaidText: string;
  attachmentNames: string[];
}

export interface RenderedEmail { subject: string; text: string; html: string }

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** A subject is one line: line breaks (which could inject extra mail headers) become spaces. */
export function cleanSubject(subject: string): string {
  return subject.replace(/[\r\n\p{Zl}\p{Zp}]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, SEND_LIMITS.subjectMax);
}

const paragraphs = (text: string) => text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
const lines = (text: string) => escapeHtml(text).replace(/\r?\n/g, "<br>");

const INK = "#1b1a17";
const MUTED = "#6b665b";
const LINE = "#ddd7c9";
const GREEN = "#1f5c46";

/**
 * The summary email in two forms. The HTML is deliberately plain and uses inline styles so mail apps show it as intended;
 * every value that came from a person or from a bill is escaped. Colours follow the app's paper/ink palette.
 */
export function renderSummaryEmail(input: SummaryEmailInput): RenderedEmail {
  const subject = cleanSubject(input.subject);
  const rows = input.bills.map((b) => `
        <tr>
          <td style="padding:8px 12px 8px 0;border-bottom:1px solid ${LINE};vertical-align:top">${escapeHtml(b.biller)}${b.note ? `<br><span style="color:${MUTED};font-size:12px">${escapeHtml(b.note)}</span>` : ""}</td>
          <td style="padding:8px 12px;border-bottom:1px solid ${LINE};vertical-align:top;color:${MUTED};white-space:nowrap">${escapeHtml(b.dueText ?? "—")}${b.paid ? `<br><span style="font-size:12px">paid</span>` : ""}</td>
          <td style="padding:8px 0 8px 12px;border-bottom:1px solid ${LINE};vertical-align:top;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">${escapeHtml(b.amountText ?? "not known")}</td>
        </tr>`).join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f6f3ec;color:${INK};font-family:Inter,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5">
  <div style="max-width:600px;margin:0 auto">
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px"><tr>
      <td width="22" height="22" style="width:22px;height:22px;background:${GREEN};border-radius:4px;text-align:center;color:#f6f3ec;font-size:13px;line-height:22px" aria-hidden="true">B</td>
      <td style="padding-left:8px;font-family:Georgia,'Times New Roman',serif;font-size:18px;color:${INK}">Billfold</td>
    </tr></table>
    <p style="margin:0 0 4px;color:${MUTED};font-size:12px;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(input.orgName)}</p>
    <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:26px">${escapeHtml(input.periodLabel)}</h1>
    ${paragraphs(input.intro).map((p) => `<p style="margin:0 0 12px">${lines(p)}</p>`).join("\n    ")}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:16px 0;font-size:14px">
      <thead><tr>
        <th align="left" style="padding:0 12px 6px 0;border-bottom:1px solid ${INK};font-weight:600;font-size:12px;color:${MUTED}">BILL</th>
        <th align="left" style="padding:0 12px 6px;border-bottom:1px solid ${INK};font-weight:600;font-size:12px;color:${MUTED}">DUE</th>
        <th align="right" style="padding:0 0 6px 12px;border-bottom:1px solid ${INK};font-weight:600;font-size:12px;color:${MUTED}">AMOUNT</th>
      </tr></thead>
      <tbody>${rows}
        <tr><td colspan="2" style="padding:10px 12px 4px 0;font-weight:600">Total (${input.bills.length} ${input.bills.length === 1 ? "bill" : "bills"})</td><td style="padding:10px 0 4px 12px;text-align:right;font-weight:600;white-space:nowrap">${escapeHtml(input.totalText)}</td></tr>
        <tr><td colspan="2" style="padding:0 12px 4px 0;color:${MUTED}">Not paid yet</td><td style="padding:0 0 4px 12px;text-align:right;color:${MUTED};white-space:nowrap">${escapeHtml(input.unpaidText)}</td></tr>
      </tbody>
    </table>
    ${input.attachmentNames.length > 0 ? `<p style="margin:0 0 12px;color:${MUTED};font-size:13px">Attached: ${escapeHtml(input.attachmentNames.join(", "))}</p>` : ""}
    ${paragraphs(input.signoff).map((p) => `<p style="margin:0 0 12px">${lines(p)}</p>`).join("\n    ")}
  </div>
</body></html>`;

  const width = Math.max(...input.bills.map((b) => b.biller.length), 10);
  const table = input.bills.map((b) => `${b.biller.padEnd(width)}  ${(b.dueText ?? "-").padEnd(12)}  ${(b.amountText ?? "not known").padStart(14)}${b.paid ? "  (paid)" : ""}`);
  const text = [
    input.periodLabel, "", ...paragraphs(input.intro).flatMap((p) => [p, ""]),
    ...table, "", `Total (${input.bills.length}): ${input.totalText}`, `Not paid yet: ${input.unpaidText}`,
    ...(input.attachmentNames.length > 0 ? ["", `Attached: ${input.attachmentNames.join(", ")}`] : []),
    "", ...paragraphs(input.signoff).flatMap((p) => [p, ""]),
    "--", "Sent with Billfold",
  ].join("\n").trimEnd() + "\n";

  return { subject, text, html };
}
