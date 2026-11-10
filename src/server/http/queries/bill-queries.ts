import "server-only";
import { ORG_UTC_OFFSET_MINUTES } from "@/constants/app";
import type { BillFilter, BillRecord } from "@/domain/ports/records";
import { INR } from "@/domain/value-objects/currency";
import { isPeriodKey, periodKeyFor, previousPeriodKey } from "@/domain/value-objects/period";
import { formatCompact, formatMoney } from "@/lib/format-money";
import { niceTicks } from "@/lib/chart";
import { periodLabel } from "@/constants/runs";
import type { BillFilterChoice, BillListDto, BillRowDto, ReportDto } from "@/types/bill";
import { container } from "../../composition-root/container";

const money = (minor: bigint) => formatMoney({ minor, currency: INR });

/** "1234.50" for forms and spreadsheets: a plain number, no symbol, no grouping. */
export function plainAmount(minor: bigint | null): string {
  if (minor === null) return "";
  const whole = minor / 100n;
  const fraction = (minor % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function toBillRow(b: BillRecord): BillRowDto {
  return {
    id: b.id, periodKey: b.periodKey, billerName: b.billerName, sourceName: b.sourceName,
    amountText: b.amountMinor === null ? null : money(b.amountMinor), amountPlain: plainAmount(b.amountMinor),
    billDate: b.billDate, dueDate: b.dueDate, note: b.note, needsReview: b.needsReview, paid: b.paidAt !== null, deleted: b.deletedAt !== null,
    method: b.method, confidence: b.confidence, driveLink: b.files[0]?.webViewLink ?? null, hasFile: b.files.length > 0,
  };
}

export function parseBillFilter(raw: { period?: string; q?: string; filter?: string }): { filter: BillFilter; choice: BillFilterChoice; period: string; q: string } {
  const choice: BillFilterChoice = raw.filter === "review" || raw.filter === "unpaid" || raw.filter === "deleted" ? raw.filter : "all";
  const period = raw.period && isPeriodKey(raw.period) ? raw.period : "";
  const q = (raw.q ?? "").slice(0, 80);
  return {
    choice, period, q,
    filter: {
      periodKey: period || null, search: q || null,
      needsReview: choice === "review", unpaid: choice === "unpaid", deleted: choice === "deleted" ? "only" : "exclude",
    },
  };
}

export async function listBills(orgId: string, filter: BillFilter): Promise<BillListDto> {
  const [rows, everything] = await Promise.all([container().listBills.list(orgId, filter), container().listBills.list(orgId, {})]);
  return {
    rows: rows.map(toBillRow),
    months: [...new Set(everything.map((b) => b.periodKey))].sort().reverse(),
    needsReviewCount: everything.filter((b) => b.needsReview).length,
    totalText: money(rows.reduce((t, b) => t + (b.amountMinor ?? 0n), 0n)),
    missingAmounts: rows.filter((b) => b.amountMinor === null).length,
  };
}

export async function getBill(orgId: string, id: string) {
  const bill = await container().listBills.find(orgId, id);
  return bill ? toBillRow(bill) : null;
}

export async function needsReviewCount(orgId: string): Promise<number> {
  return (await container().listBills.list(orgId, { needsReview: true })).length;
}

/** Months a bill may be filed under: this month and the 36 before it. */
export function billPeriodChoices(now = new Date()): string[] {
  const out: string[] = [];
  let key = periodKeyFor(now, ORG_UTC_OFFSET_MINUTES);
  for (let i = 0; i < 37; i++) { out.push(key); key = previousPeriodKey(key); }
  return out;
}

export async function getReport(orgId: string, requestedPeriod: string | null): Promise<ReportDto> {
  const r = await container().reports.build(orgId, requestedPeriod && isPeriodKey(requestedPeriod) ? requestedPeriod : null);
  const trend = r.trend.map((p) => ({ key: p.periodKey, label: periodLabel(p.periodKey), value: Number(p.totalMinor) / 100, text: money(p.totalMinor), count: p.count, missing: p.missingAmount }));
  const { max, ticks } = niceTicks(Math.max(...trend.map((t) => t.value), 0));
  const previous = r.trend[r.trend.length - 2];
  const change = previous && previous.totalMinor > 0n ? Math.round(((Number(r.month.totalMinor) - Number(previous.totalMinor)) / Number(previous.totalMinor)) * 100) : null;
  const today = new Date(Date.now() + ORG_UTC_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
  const days = (due: string) => Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const dueRow = (b: BillRecord) => {
    const d = days(b.dueDate as string);
    return { id: b.id, biller: b.billerName, dueDate: b.dueDate as string, amountText: b.amountMinor === null ? null : money(b.amountMinor), whenText: d < 0 ? `${-d} day${d === -1 ? "" : "s"} overdue` : d === 0 ? "due today" : `in ${d} day${d === 1 ? "" : "s"}` };
  };
  return {
    periodKey: r.periodKey, hasBills: r.monthsWithBills.length > 0, months: [...new Set([...r.monthsWithBills, r.periodKey])].sort().reverse(), trend,
    axis: { max, ticks: ticks.map((value) => ({ value, label: formatCompact({ minor: BigInt(Math.round(value * 100)), currency: INR }) })) },
    monthTotalText: money(r.month.totalMinor), monthCount: r.month.count, missingAmounts: r.month.missingAmount, unpaidText: money(r.unpaidTotalMinor),
    previousTotalText: previous ? money(previous.totalMinor) : null,
    changeText: change === null ? null : `${change > 0 ? "+" : ""}${change}% on ${periodLabel(previous?.periodKey ?? "")}`,
    breakdown: r.breakdown.map((row) => ({
      biller: row.biller, totalText: money(row.totalMinor), count: row.count,
      changeText: row.changePercent === null ? "new" : row.changePercent === 0 ? "no change" : `${row.changePercent > 0 ? "+" : ""}${row.changePercent}%`,
      changeTone: row.changePercent === null || row.changePercent === 0 ? "neutral" : row.changePercent > 0 ? "warn" : "good",
    })),
    overdue: r.overdue.map(dueRow), dueSoon: r.dueSoon.map(dueRow), insights: r.insights,
  };
}
