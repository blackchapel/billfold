export interface Currency {
  code: string;
  minorUnits: number;
  symbol: string;
  name: string;
  locale: string;
}

export const INR: Currency = { code: "INR", minorUnits: 2, symbol: "₹", name: "Indian Rupee", locale: "en-IN" };

const KNOWN: Record<string, Currency> = { INR };

export function currencyByCode(code: string): Currency | null {
  return KNOWN[code.toUpperCase()] ?? null;
}
