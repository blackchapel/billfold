import { currencyByCode } from "@/domain/value-objects/currency";
import { Money } from "@/domain/value-objects/money";
import { parseDate } from "@/domain/value-objects/bill-text";
import type { Confidence, ExtractedBill } from "@/domain/value-objects/bill-data";
import type { BillExtractor, BillExtractorInput } from "@/domain/ports/services";

const TIMEOUT_MS = 40_000;
const MODEL_NAME = /^[a-z0-9][a-z0-9.\-]{1,60}$/i;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    biller_name: { type: "STRING", nullable: true },
    total_amount_due: { type: "STRING", nullable: true },
    currency: { type: "STRING", nullable: true },
    bill_date: { type: "STRING", nullable: true },
    due_date: { type: "STRING", nullable: true },
    confidence: { type: "STRING", enum: ["high", "medium", "low"] },
  },
  required: ["total_amount_due", "confidence"],
};

interface GeminiFields {
  biller_name?: string | null;
  total_amount_due?: string | null;
  currency?: string | null;
  bill_date?: string | null;
  due_date?: string | null;
  confidence?: string;
}

/**
 * Reads the bill with Gemini. Only the unlocked PDF and a short instruction are sent: never a password, a subject line,
 * an email address or any credential. If Gemini cannot be reached or answers badly, the built-in reader takes over.
 */
export class GeminiBillExtractor implements BillExtractor {
  constructor(
    private readonly apiKey: string,
    private readonly defaultModel: string,
    private readonly fallback: BillExtractor,
    private readonly http: typeof fetch = fetch,
  ) {}

  async extract(input: BillExtractorInput): Promise<ExtractedBill> {
    try {
      return await this.askGemini(input);
    } catch {
      const local = await this.fallback.extract(input);
      const remark = "Gemini could not read this bill, so the built-in reader was used.";
      return { ...local, note: local.note ? `${remark} ${local.note}` : remark };
    }
  }

  private async askGemini(input: BillExtractorInput): Promise<ExtractedBill> {
    const model = this.defaultModel;
    if (!MODEL_NAME.test(model)) throw new Error("Invalid model name");
    const currency = currencyByCode(input.hints.currencyCode);
    if (!currency) throw new Error("Unsupported currency");

    const prompt = [
      "You read household bills from India. Answer with JSON only.",
      `The bill is from "${input.hints.sourceName.slice(0, 80)}" for ${input.hints.periodKey}.`,
      `total_amount_due: the single amount the customer must pay now, as a plain decimal string in ${currency.code} such as "1234.50" (no symbol, no commas). Use null if you are not sure.`,
      "bill_date and due_date: YYYY-MM-DD, or null. biller_name: the company that issued the bill, or null.",
      "confidence: high only if the amount is clearly labelled as the total due; low if you had to guess. Never invent values.",
    ].join("\n");

    const res = await this.http(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: "application/pdf", data: Buffer.from(input.pdfBytes).toString("base64") } }, { text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Gemini request failed: ${res.status}`);
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no answer");
    const fields = JSON.parse(text) as GeminiFields;
    return this.toBill(fields, currency.code);
  }

  private toBill(f: GeminiFields, expectedCurrency: string): ExtractedBill {
    const currency = currencyByCode(expectedCurrency);
    const claimed = f.currency?.toUpperCase();
    const mismatch = claimed && claimed !== expectedCurrency;
    const money = currency && f.total_amount_due && !mismatch ? Money.parse(f.total_amount_due, currency) : null;
    const amountMinor = money && money.isPositive() ? money.minor : null;
    const stated: Confidence = f.confidence === "high" || f.confidence === "medium" || f.confidence === "low" ? f.confidence : "low";
    const date = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? parseDate(v.split("-").reverse().join("/")) : null);
    let note: string | null = null;
    if (mismatch) note = `The bill seems to be in ${claimed}, which Billfold does not support yet. Please check it.`;
    else if (amountMinor === null) note = "Gemini could not find a total amount. Please enter it by hand.";
    return {
      amountMinor, method: "gemini", note,
      confidence: amountMinor === null ? "low" : stated,
      billDate: date(f.bill_date), dueDate: date(f.due_date),
      billerName: f.biller_name?.trim().slice(0, 120) || null,
    };
  }
}
