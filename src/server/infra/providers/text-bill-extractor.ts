import { currencyByCode } from "@/domain/value-objects/currency";
import { parseBillText } from "@/domain/value-objects/bill-text";
import type { ExtractedBill } from "@/domain/value-objects/bill-data";
import type { BillExtractor, BillExtractorInput } from "@/domain/ports/services";

/** The built-in reader: no network, no key. Reads the PDF's own text with the label rules in `parseBillText`. */
export class TextBillExtractor implements BillExtractor {
  async extract(input: BillExtractorInput): Promise<ExtractedBill> {
    const currency = currencyByCode(input.hints.currencyCode);
    if (!currency) return { amountMinor: null, billDate: null, dueDate: null, billerName: null, confidence: "low", method: "text", note: `Currency ${input.hints.currencyCode} is not supported yet.` };
    const parsed = parseBillText(input.text, currency);
    return { ...parsed, billerName: null, method: "text" };
  }
}
