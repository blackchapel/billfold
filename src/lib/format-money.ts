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
