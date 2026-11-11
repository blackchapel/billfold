export interface MoneyLike {
  minor: bigint;
  currency: { minorUnits: number; symbol: string; locale: string };
}

/** The single place money is formatted for display. Grouping follows the currency locale (en-IN for INR). */
export function formatMoney(money: MoneyLike): string {
  const divisor = 10n ** BigInt(money.currency.minorUnits);
  const negative = money.minor < 0n;
  const abs = negative ? -money.minor : money.minor;
  const whole = new Intl.NumberFormat(money.currency.locale).format(abs / divisor);
  const fraction = (abs % divisor).toString().padStart(money.currency.minorUnits, "0");
  const body = money.currency.minorUnits > 0 ? `${whole}.${fraction}` : whole;
  return `${negative ? "-" : ""}${money.currency.symbol}${body}`;
}

/** Short form for chart axes: ₹950, ₹1.2k, ₹3.4L (lakh), ₹1.5Cr. Whole rupees only. For exact amounts use `formatMoney`. */
export function formatCompact(money: MoneyLike): string {
  const rupees = Number(money.minor) / 10 ** money.currency.minorUnits;
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "-" : "";
  const body = abs >= 1e7 ? `${trim(abs / 1e7)}Cr` : abs >= 1e5 ? `${trim(abs / 1e5)}L` : abs >= 1e3 ? `${trim(abs / 1e3)}k` : String(Math.round(abs));
  return `${sign}${money.currency.symbol}${body}`;
}
