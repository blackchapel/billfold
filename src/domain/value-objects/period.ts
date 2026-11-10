/** A calendar month identified as "YYYY-MM". */
export function isPeriodKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function previousPeriodKey(key: string): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export const PERIOD_MODES = ["previous_month", "current_month"] as const;
export type PeriodMode = (typeof PERIOD_MODES)[number];

export const PERIOD_MODE_LABELS: Record<PeriodMode, string> = {
  previous_month: "Last calendar month",
  current_month: "This calendar month",
};

/** Month boundaries are drawn in the org's local time (India: UTC+5:30, no daylight saving). */
export function periodKeyFor(date: Date, utcOffsetMinutes: number): string {
  const local = new Date(date.getTime() + utcOffsetMinutes * 60_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The instants a month starts (inclusive) and ends (exclusive). */
export function periodRange(key: string, utcOffsetMinutes: number): { start: Date; end: Date } {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const at = (year: number, month: number) => new Date(Date.UTC(year, month - 1, 1) - utcOffsetMinutes * 60_000);
  return { start: at(y, m), end: m === 12 ? at(y + 1, 1) : at(y, m + 1) };
}

export function resolvePeriod(mode: PeriodMode, now: Date, utcOffsetMinutes: number): { key: string; start: Date; end: Date } {
  const current = periodKeyFor(now, utcOffsetMinutes);
  const key = mode === "current_month" ? current : previousPeriodKey(current);
  return { key, ...periodRange(key, utcOffsetMinutes) };
}
