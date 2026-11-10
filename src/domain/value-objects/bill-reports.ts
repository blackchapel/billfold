import { formatMoney } from "@/lib/format-money";
import { INR } from "./currency";
import { previousPeriodKey } from "./period";

/** The few facts about a bill that reports need. Deleted bills are never passed in. */
export interface ReportBill {
  periodKey: string;
  billerName: string;
  amountMinor: bigint | null;
  dueDate: string | null;
  paid: boolean;
  needsReview: boolean;
}

/** The last `count` months ending at `endKey`, oldest first, e.g. for a trend chart. */
export function lastPeriodKeys(endKey: string, count: number): string[] {
  const keys = [endKey];
  while (keys.length < count) keys.unshift(previousPeriodKey(keys[0] as string));
  return keys;
}

export interface PeriodTotal { periodKey: string; totalMinor: bigint; count: number; missingAmount: number }

export function periodTotals(bills: ReportBill[], keys: string[]): PeriodTotal[] {
  return keys.map((periodKey) => {
    const inPeriod = bills.filter((b) => b.periodKey === periodKey);
    return {
      periodKey, count: inPeriod.length, missingAmount: inPeriod.filter((b) => b.amountMinor === null).length,
      totalMinor: inPeriod.reduce((sum, b) => sum + (b.amountMinor ?? 0n), 0n),
    };
  });
}

/** Whole-number percent change (rounded half away from zero), or null when there is nothing to compare with. */
export function percentChange(current: bigint, previous: bigint): number | null {
  if (previous <= 0n) return null;
  const scaled = (current - previous) * 100n;
  const half = previous / 2n;
  return Number(scaled >= 0n ? (scaled + half) / previous : -((-scaled + half) / previous));
}

export interface BillerRow { biller: string; totalMinor: bigint; count: number; previousMinor: bigint | null; changePercent: number | null }

const norm = (name: string) => name.trim().toLowerCase();

/** One row per biller for a month, biggest first, each compared with the month before. */
export function billerBreakdown(bills: ReportBill[], periodKey: string): BillerRow[] {
  const previousKey = previousPeriodKey(periodKey);
  const rows = new Map<string, BillerRow>();
  for (const b of bills.filter((x) => x.periodKey === periodKey)) {
    const key = norm(b.billerName);
    const row = rows.get(key) ?? { biller: b.billerName.trim(), totalMinor: 0n, count: 0, previousMinor: null, changePercent: null };
    row.totalMinor += b.amountMinor ?? 0n;
    row.count += 1;
    rows.set(key, row);
  }
  for (const b of bills.filter((x) => x.periodKey === previousKey)) {
    const row = rows.get(norm(b.billerName));
    if (row) row.previousMinor = (row.previousMinor ?? 0n) + (b.amountMinor ?? 0n);
  }
  for (const row of rows.values()) row.changePercent = row.previousMinor === null ? null : percentChange(row.totalMinor, row.previousMinor);
  return [...rows.values()].sort((a, b) => (b.totalMinor > a.totalMinor ? 1 : b.totalMinor < a.totalMinor ? -1 : a.biller.localeCompare(b.biller)));
}

export interface DueSplit<T extends ReportBill> { overdue: T[]; dueSoon: T[] }

/** Unpaid bills past their due date, and unpaid ones due within `withinDays` days (today included). Dates are "YYYY-MM-DD". */
export function dueBills<T extends ReportBill>(bills: T[], today: string, withinDays = 7): DueSplit<T> {
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + withinDays);
  const lastDay = limit.toISOString().slice(0, 10);
  const unpaid = bills.filter((b) => !b.paid && b.dueDate !== null).sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string));
  return {
    overdue: unpaid.filter((b) => (b.dueDate as string) < today),
    dueSoon: unpaid.filter((b) => (b.dueDate as string) >= today && (b.dueDate as string) <= lastDay),
  };
}

export interface Insight { tone: "good" | "warn" | "bad" | "neutral"; text: string }

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
const rupees = (minor: bigint) => formatMoney({ minor, currency: INR });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A few plain sentences about the month. Only things worth a person's attention; never filler. */
export function buildInsights(input: { bills: ReportBill[]; periodKey: string; today: string }): Insight[] {
  const { bills, periodKey, today } = input;
  const out: Insight[] = [];

  const review = bills.filter((b) => b.needsReview).length;
  if (review > 0) out.push({ tone: "warn", text: `${plural(review, "bill needs", "bills need")} a quick check before you rely on the numbers.` });

  const { overdue, dueSoon } = dueBills(bills, today);
  const sum = (list: ReportBill[]) => list.reduce((t, b) => t + (b.amountMinor ?? 0n), 0n);
  if (overdue.length > 0) out.push({ tone: "bad", text: `${plural(overdue.length, "bill is", "bills are")} past the due date and not marked paid (${rupees(sum(overdue))}).` });
  if (dueSoon.length > 0) out.push({ tone: "warn", text: `${plural(dueSoon.length, "bill is", "bills are")} due in the next 7 days (${rupees(sum(dueSoon))}).` });

  const [current, previous] = periodTotals(bills, [periodKey, previousPeriodKey(periodKey)]) as [PeriodTotal, PeriodTotal];
  const change = percentChange(current.totalMinor, previous.totalMinor);
  if (change !== null && Math.abs(change) >= 5) {
    out.push({
      tone: change > 0 ? "warn" : "good",
      text: `${monthName(periodKey)} is ${Math.abs(change)}% ${change > 0 ? "higher" : "lower"} than ${monthName(previous.periodKey)} (${rupees(current.totalMinor)} against ${rupees(previous.totalMinor)}).`,
    });
  }
  const riser = billerBreakdown(bills, periodKey)
    .filter((r) => r.changePercent !== null && r.changePercent >= 20 && r.previousMinor !== null && r.totalMinor - r.previousMinor >= 50_000n)
    .sort((a, b) => Number(b.totalMinor - (b.previousMinor ?? 0n)) - Number(a.totalMinor - (a.previousMinor ?? 0n)))[0];
  if (riser) out.push({ tone: "warn", text: `${riser.biller} is up ${riser.changePercent}% on last month (${rupees(riser.totalMinor)} against ${rupees(riser.previousMinor ?? 0n)}).` });

  if (current.missingAmount > 0) out.push({ tone: "neutral", text: `${plural(current.missingAmount, "bill has", "bills have")} no amount yet, so ${monthName(periodKey)}'s total is lower than it should be.` });
  return out.slice(0, 5);
}
