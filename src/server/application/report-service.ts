import { ORG_UTC_OFFSET_MINUTES } from "@/constants/app";
import type { BillRepository } from "@/domain/ports/repositories";
import type { BillRecord } from "@/domain/ports/records";
import type { Clock } from "@/domain/ports/services";
import { billerBreakdown, buildInsights, dueBills, lastPeriodKeys, periodTotals, type BillerRow, type Insight, type PeriodTotal, type ReportBill } from "@/domain/value-objects/bill-reports";
import { isPeriodKey, periodKeyFor } from "@/domain/value-objects/period";

export const TREND_MONTHS = 12;

export interface ReportModel {
  periodKey: string;
  /** Oldest first, TREND_MONTHS long, ending at the chosen month. */
  trend: PeriodTotal[];
  month: PeriodTotal;
  breakdown: BillerRow[];
  overdue: BillRecord[];
  dueSoon: BillRecord[];
  unpaidTotalMinor: bigint;
  insights: Insight[];
  /** Months that have bills, newest first, for the month picker. */
  monthsWithBills: string[];
}

const toReport = (b: BillRecord): ReportBill => ({
  periodKey: b.periodKey, billerName: b.billerName, amountMinor: b.amountMinor, dueDate: b.dueDate, paid: b.paidAt !== null, needsReview: b.needsReview,
});

/** Works out everything the Reports page shows. Read-only; any member may see it. */
export class ReportService {
  constructor(private readonly bills: BillRepository, private readonly clock: Clock) {}

  async build(orgId: string, requestedPeriod: string | null): Promise<ReportModel> {
    const now = this.clock.now();
    const currentKey = periodKeyFor(now, ORG_UTC_OFFSET_MINUTES);
    const all = await this.bills.list(orgId, {});
    const monthsWithBills = [...new Set(all.map((b) => b.periodKey))].sort().reverse();
    // Any real month up to this one can be opened, also one with no bills: the chart links to every column, so each must lead somewhere.
    const usable = requestedPeriod !== null && isPeriodKey(requestedPeriod) && requestedPeriod >= "2000-01" && requestedPeriod <= currentKey;
    const periodKey = usable ? requestedPeriod : (monthsWithBills[0] ?? currentKey);

    const keys = lastPeriodKeys(periodKey, TREND_MONTHS);
    // Overdue and upcoming bills and the insights look at every bill, not only the chosen window: a bill from four months ago can still be unpaid.
    const reportBills = all.map(toReport);
    const today = new Date(now.getTime() + ORG_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
    const due = dueBills(all.map((bill) => ({ ...toReport(bill), bill })), today);
    const trend = periodTotals(reportBills, keys);
    return {
      periodKey, trend, month: trend[trend.length - 1] as PeriodTotal,
      breakdown: billerBreakdown(reportBills, periodKey),
      overdue: due.overdue.map((x) => x.bill), dueSoon: due.dueSoon.map((x) => x.bill),
      unpaidTotalMinor: all.filter((b) => b.paidAt === null && b.periodKey === periodKey).reduce((t, b) => t + (b.amountMinor ?? 0n), 0n),
      insights: buildInsights({ bills: reportBills, periodKey, today }),
      monthsWithBills,
    };
  }
}
