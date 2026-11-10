export type Confidence = "high" | "medium" | "low";

/** What was read from one bill. Amounts are integer minor units, dates are plain "YYYY-MM-DD" days. */
export interface ExtractedBill {
  amountMinor: bigint | null;
  billDate: string | null;
  dueDate: string | null;
  /** Biller name if the reader found one; otherwise the source name is used. */
  billerName: string | null;
  confidence: Confidence;
  method: "text" | "gemini";
  /** Plain-language remark for the person reviewing, e.g. "No readable text; this looks like a scan." */
  note: string | null;
}

/** A bill needs a person's eye when the amount is missing or the reader is unsure. */
export function needsReview(bill: Pick<ExtractedBill, "amountMinor" | "confidence">): boolean {
  return bill.amountMinor === null || bill.confidence === "low";
}

export const RUN_ITEM_STATUSES = ["pending", "processing", "done", "failed", "skipped"] as const;
export type RunItemStatus = (typeof RUN_ITEM_STATUSES)[number];

export const RUN_STATUSES = ["processing", "completed", "completed_with_errors", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const MAX_ITEM_ATTEMPTS = 5;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
