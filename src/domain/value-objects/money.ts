import type { Currency } from "./currency";

/** Immutable money value in integer minor units. Never uses floating point. */
export class Money {
  private constructor(
    readonly minor: bigint,
    readonly currency: Currency,
  ) {}

  static ofMinor(minor: bigint | number, currency: Currency): Money {
    if (typeof minor === "number" && !Number.isInteger(minor)) {
      throw new RangeError("Minor units must be an integer");
    }
    return new Money(BigInt(minor), currency);
  }

  /** Parses a decimal string such as "1,299.50" or "1299" into minor units. */
  static parse(input: string, currency: Currency): Money | null {
    const cleaned = input.trim().replace(/[,\s]/g, "").replace(currency.symbol, "");
    const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(cleaned);
    if (!match) return null;
    const [, sign, whole = "0", fraction = ""] = match;
    if (fraction.length > currency.minorUnits && /[1-9]/.test(fraction.slice(currency.minorUnits))) {
      return null;
    }
    const frac = fraction.slice(0, currency.minorUnits).padEnd(currency.minorUnits, "0");
    const minor = BigInt(whole + frac) * (sign ? -1n : 1n);
    return new Money(minor, currency);
  }

  add(other: Money): Money {
    this.assertSame(other);
    return new Money(this.minor + other.minor, this.currency);
  }

  isPositive(): boolean {
    return this.minor > 0n;
  }

  equals(other: Money): boolean {
    return this.minor === other.minor && this.currency.code === other.currency.code;
  }

  private assertSame(other: Money) {
    if (other.currency.code !== this.currency.code) {
      throw new TypeError("Cannot combine different currencies");
    }
  }
}
