import type { Confidence } from "./bill-data";
import type { Currency } from "./currency";
import { Money } from "./money";

export interface ParsedBillText {
  amountMinor: bigint | null;
  billDate: string | null;
  dueDate: string | null;
  confidence: Confidence;
  note: string | null;
}

/** Labels that introduce the amount to pay, strongest first. The first label found wins. */
const AMOUNT_LABELS: { label: RegExp; confidence: Confidence }[] = [
  { label: /total\s+amount\s+(?:due|payable)/i, confidence: "high" },
  { label: /(?:net|total)\s+(?:amount\s+)?payable/i, confidence: "high" },
  { label: /amount\s+(?:due|payable|to\s+pay)/i, confidence: "high" },
  { label: /(?:current\s+)?(?:bill|invoice)\s+amount/i, confidence: "high" },
  { label: /pay\s+now/i, confidence: "medium" },
  { label: /(?:grand\s+)?total(?:\s+(?:bill|amount|charges))?/i, confidence: "medium" },
];

// ₹ / Rs / INR optional, then digits with Indian (1,23,456.78) or western (123,456.78) grouping.
const NUMBER = String.raw`(?:₹|Rs\.?|INR)?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function parseAmount(raw: string, currency: Currency): bigint | null {
  const money = Money.parse(raw, currency);
  return money && money.isPositive() ? money.minor : null;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null; // e.g. 31 Feb
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Reads "15/12/2026", "15-12-26", "15 Dec 2026", "Dec 15, 2026" (day first for numeric dates, as in India). */
export function parseDate(text: string): string | null {
  const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/.exec(text);
  if (numeric) {
    const year = Number(numeric[3]);
    return iso(year < 100 ? 2000 + year : year, Number(numeric[2]), Number(numeric[1]));
  }
  const dayFirst = /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3})[a-z]*\.?,?[\s-]+(\d{4})\b/.exec(text);
  if (dayFirst) return iso(Number(dayFirst[3]), MONTHS.indexOf((dayFirst[2] ?? "").toLowerCase()) + 1, Number(dayFirst[1]));
  const monthFirst = /\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/.exec(text);
  if (monthFirst) return iso(Number(monthFirst[3]), MONTHS.indexOf((monthFirst[1] ?? "").toLowerCase()) + 1, Number(monthFirst[2]));
  return null;
}

function labelledDate(text: string, label: RegExp): string | null {
  const match = new RegExp(`${label.source}\\s*[:\\-]?\\s*(.{0,24})`, "i").exec(text);
  return match?.[1] ? parseDate(match[1]) : null;
}

/**
 * A plain-text reader for bills, used when no Gemini key is configured (and as a fallback). It looks for the usual
 * "Total amount due" style labels. It never guesses silently: anything it is unsure about is reported as low confidence.
 */
export function parseBillText(rawText: string, currency: Currency): ParsedBillText {
  const text = rawText.replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n");
  if (text.trim().length < 10) {
    return { amountMinor: null, billDate: null, dueDate: null, confidence: "low", note: "No readable text in this PDF. It may be a scan, so please enter the amount by hand." };
  }

  let amountMinor: bigint | null = null;
  let confidence: Confidence = "low";
  for (const { label, confidence: level } of AMOUNT_LABELS) {
    const match = new RegExp(`${label.source}[^\\d₹\\n]{0,40}${NUMBER}`, "i").exec(text);
    const value = match?.[1] ? parseAmount(match[1], currency) : null;
    if (value !== null) { amountMinor = value; confidence = level; break; }
  }
  let note: string | null = null;
  if (amountMinor === null) {
    // No label: fall back to the largest amount written with a currency mark, and say so.
    const marked = [...text.matchAll(/(?:₹|Rs\.?|INR)\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi)]
      .map((m) => (m[1] ? parseAmount(m[1], currency) : null))
      .filter((v): v is bigint => v !== null);
    if (marked.length > 0) {
      amountMinor = marked.reduce((a, b) => (b > a ? b : a));
      note = "No “total” label was found, so the largest amount on the page was used. Please check it.";
    } else {
      note = "No amount could be found. Please enter it by hand.";
    }
  }
  return {
    amountMinor, confidence,
    billDate: labelledDate(text, /(?:bill|invoice|statement)\s+date/),
    dueDate: labelledDate(text, /due\s+(?:date|on|by)/) ?? labelledDate(text, /pay\s+(?:on\s+or\s+)?before/),
    note,
  };
}
