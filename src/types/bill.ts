/** One bill as the screen needs it. Amounts arrive formatted; `amountPlain` is for the form and the CSV ("1234.50"). */
export interface BillRowDto {
  id: string;
  periodKey: string;
  billerName: string;
  sourceName: string;
  amountText: string | null;
  amountPlain: string;
  billDate: string | null;
  dueDate: string | null;
  note: string | null;
  needsReview: boolean;
  paid: boolean;
  deleted: boolean;
  /** "text", "gemini" or "manual". */
  method: string;
  confidence: string;
  driveLink: string | null;
  hasFile: boolean;
}

export type BillFilterChoice = "all" | "review" | "unpaid" | "deleted";

export interface BillListDto {
  rows: BillRowDto[];
  /** Months that have bills, newest first. */
  months: string[];
  needsReviewCount: number;
  totalText: string;
  missingAmounts: number;
}

export interface TrendPointDto { key: string; label: string; value: number; text: string; count: number; missing: number }

export interface BreakdownRowDto { biller: string; totalText: string; count: number; changeText: string; changeTone: "good" | "warn" | "neutral" }

export interface DueRowDto { id: string; biller: string; dueDate: string; amountText: string | null; whenText: string }

export interface ReportDto {
  periodKey: string;
  /** Whether the organisation has any bill at all. A month with none is still a valid month to look at. */
  hasBills: boolean;
  months: string[];
  trend: TrendPointDto[];
  axis: { max: number; ticks: { value: number; label: string }[] };
  monthTotalText: string;
  monthCount: number;
  missingAmounts: number;
  unpaidText: string;
  previousTotalText: string | null;
  changeText: string | null;
  breakdown: BreakdownRowDto[];
  overdue: DueRowDto[];
  dueSoon: DueRowDto[];
  insights: { tone: "good" | "warn" | "bad" | "neutral"; text: string }[];
}
