import { describe, expect, it } from "vitest";
import { billerBreakdown, buildInsights, dueBills, lastPeriodKeys, percentChange, periodTotals, type ReportBill } from "@/domain/value-objects/bill-reports";

const bill = (over: Partial<ReportBill> = {}): ReportBill => ({ periodKey: "2026-10", billerName: "Jio", amountMinor: 100_000n, dueDate: null, paid: false, needsReview: false, ...over });

describe("period helpers", () => {
  it("lists the last N months oldest first, across a year end", () => {
    expect(lastPeriodKeys("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(lastPeriodKeys("2026-02", 1)).toEqual(["2026-02"]);
  });
  it("totals each month, counting bills without an amount separately", () => {
    const bills = [bill({ amountMinor: 123_450n }), bill({ amountMinor: 5_000n, billerName: "Water" }), bill({ amountMinor: null }), bill({ periodKey: "2026-09", amountMinor: 7n })];
    expect(periodTotals(bills, ["2026-08", "2026-09", "2026-10"])).toEqual([
      { periodKey: "2026-08", totalMinor: 0n, count: 0, missingAmount: 0 },
      { periodKey: "2026-09", totalMinor: 7n, count: 1, missingAmount: 0 },
      { periodKey: "2026-10", totalMinor: 128_450n, count: 3, missingAmount: 1 },
    ]);
  });
});

describe("percentChange", () => {
  it("rounds to whole percents, half away from zero, and is null without a base", () => {
    expect(percentChange(112n, 100n)).toBe(12);
    expect(percentChange(150n, 100n)).toBe(50);
    expect(percentChange(88n, 100n)).toBe(-12);
    expect(percentChange(1005n, 1000n)).toBe(1); // 0.5 rounds up
    expect(percentChange(995n, 1000n)).toBe(-1); // -0.5 rounds away from zero
    expect(percentChange(100n, 100n)).toBe(0);
    expect(percentChange(0n, 100n)).toBe(-100);
    expect(percentChange(50n, 0n)).toBeNull();
  });
  it("is exact for very large amounts", () => {
    expect(percentChange(2n * 10n ** 18n, 10n ** 18n)).toBe(100);
  });
});

describe("billerBreakdown", () => {
  it("groups one biller's bills (names compared without case or spacing), biggest first, with the change on last month", () => {
    const rows = billerBreakdown([
      bill({ amountMinor: 120_000n }), bill({ billerName: " jio ", amountMinor: 30_000n }), bill({ billerName: "Power", amountMinor: 500_000n }), bill({ billerName: "New biller", amountMinor: 9_900n }),
      bill({ periodKey: "2026-09", amountMinor: 100_000n }), bill({ periodKey: "2026-09", billerName: "Power", amountMinor: 500_000n }), bill({ periodKey: "2026-09", billerName: "Gone", amountMinor: 1_000n }),
      bill({ periodKey: "2026-08", billerName: "New biller", amountMinor: 1n }),
    ], "2026-10");
    expect(rows.map((r) => [r.biller, r.totalMinor, r.count, r.previousMinor, r.changePercent])).toEqual([
      ["Power", 500_000n, 1, 500_000n, 0],
      ["Jio", 150_000n, 2, 100_000n, 50],
      ["New biller", 9_900n, 1, null, null],
    ]);
  });
});

describe("dueBills", () => {
  const bills = [
    bill({ billerName: "Late", dueDate: "2026-11-05" }), bill({ billerName: "Today", dueDate: "2026-11-10" }), bill({ billerName: "Edge", dueDate: "2026-11-17" }),
    bill({ billerName: "Later", dueDate: "2026-11-18" }), bill({ billerName: "Paid late", dueDate: "2026-11-01", paid: true }), bill({ billerName: "No date" }),
  ];
  it("splits unpaid bills into overdue and due within a week (today and day seven included), soonest first", () => {
    const split = dueBills(bills, "2026-11-10");
    expect(split.overdue.map((b) => b.billerName)).toEqual(["Late"]);
    expect(split.dueSoon.map((b) => b.billerName)).toEqual(["Today", "Edge"]);
  });
  it("crosses month and year ends", () => {
    expect(dueBills([bill({ dueDate: "2027-01-03" })], "2026-12-30").dueSoon).toHaveLength(1);
  });
});

describe("buildInsights", () => {
  const today = "2026-11-10";
  it("says nothing when there is nothing to say", () => {
    expect(buildInsights({ bills: [], periodKey: "2026-10", today })).toEqual([]);
    expect(buildInsights({ bills: [bill({ amountMinor: 100_000n }), bill({ periodKey: "2026-09", amountMinor: 98_000n })], periodKey: "2026-10", today })).toEqual([]);
  });
  it("warns about review, overdue and upcoming bills, with the amounts", () => {
    const out = buildInsights({ bills: [
      bill({ needsReview: true, amountMinor: null }),
      bill({ billerName: "Late", dueDate: "2026-11-01", amountMinor: 250_000n }),
      bill({ billerName: "Soon", dueDate: "2026-11-12", amountMinor: 99_900n }),
    ], periodKey: "2026-10", today });
    expect(out.map((i) => i.tone)).toEqual(["warn", "bad", "warn", "neutral"]);
    expect(out[0]?.text).toBe("1 bill needs a quick check before you rely on the numbers.");
    expect(out[1]?.text).toBe("1 bill is past the due date and not marked paid (₹2,500.00).");
    expect(out[2]?.text).toBe("1 bill is due in the next 7 days (₹999.00).");
    expect(out[3]?.text).toBe("1 bill has no amount yet, so October's total is lower than it should be.");
  });
  it("compares the month with the one before and names the biller that jumped", () => {
    const out = buildInsights({ bills: [
      bill({ amountMinor: 300_000n }), bill({ periodKey: "2026-09", amountMinor: 200_000n }),
      bill({ billerName: "Power", amountMinor: 100_000n }), bill({ periodKey: "2026-09", billerName: "Power", amountMinor: 100_000n }),
    ], periodKey: "2026-10", today });
    expect(out.map((i) => i.text)).toEqual([
      "October is 33% higher than September (₹4,000.00 against ₹3,000.00).",
      "Jio is up 50% on last month (₹3,000.00 against ₹2,000.00).",
    ]);
    const down = buildInsights({ bills: [bill({ amountMinor: 50_000n }), bill({ periodKey: "2026-09", amountMinor: 100_000n })], periodKey: "2026-10", today });
    expect(down).toEqual([{ tone: "good", text: "October is 50% lower than September (₹500.00 against ₹1,000.00)." }]);
  });
  it("does not compare a month that is still running with a finished one", () => {
    const bills = [bill({ amountMinor: 100_000n }), bill({ periodKey: "2026-09", amountMinor: 900_000n })];
    expect(buildInsights({ bills, periodKey: "2026-10", today, monthInProgress: true })).toEqual([]);
    expect(buildInsights({ bills, periodKey: "2026-10", today }).map((i) => i.text)).toEqual(["October is 89% lower than September (₹1,000.00 against ₹9,000.00)."]);
    const riser = [bill({ amountMinor: 300_000n }), bill({ periodKey: "2026-09", amountMinor: 200_000n })];
    expect(buildInsights({ bills: riser, periodKey: "2026-10", today, monthInProgress: true })).toEqual([]);
  });
  it("ignores small swings and never shows more than five lines", () => {
    const many = Array.from({ length: 12 }, (_, i) => bill({ billerName: `B${i}`, needsReview: true, dueDate: i < 6 ? "2026-11-01" : "2026-11-11" }));
    expect(buildInsights({ bills: many, periodKey: "2026-10", today }).length).toBeLessThanOrEqual(5);
  });
});
