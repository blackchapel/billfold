import { describe, expect, it } from "vitest";
import { INR } from "@/domain/value-objects/currency";
import { Money } from "@/domain/value-objects/money";
import { formatMoney } from "@/lib/format-money";

describe("Money", () => {
  it("parses decimal strings into minor units without floating point", () => {
    expect(Money.parse("1,299.50", INR)?.minor).toBe(129950n);
    expect(Money.parse("₹ 0.10", INR)?.minor).toBe(10n);
    expect(Money.parse("1299", INR)?.minor).toBe(129900n);
    expect(Money.parse("0.1", INR)?.minor).toBe(10n);
  });
  it("rejects garbage and sub-minor-unit precision", () => {
    expect(Money.parse("abc", INR)).toBeNull();
    expect(Money.parse("1.234", INR)).toBeNull();
    expect(Money.parse("1.230", INR)?.minor).toBe(123n);
  });
  it("adds and refuses mixed currencies", () => {
    const a = Money.ofMinor(100n, INR);
    expect(a.add(Money.ofMinor(250n, INR)).minor).toBe(350n);
    expect(() => a.add(Money.ofMinor(1n, { ...INR, code: "USD" }))).toThrow();
  });
  it("formats INR with Indian digit grouping", () => {
    expect(formatMoney(Money.ofMinor(12345678n, INR))).toBe("₹1,23,456.78");
    expect(formatMoney(Money.ofMinor(-5n, INR))).toBe("-₹0.05");
  });
});
