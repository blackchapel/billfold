import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";
import { formatCompact } from "@/lib/format-money";
import { INR } from "@/domain/value-objects/currency";

describe("csv", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });
  it("defuses spreadsheet formulas but leaves plain numbers alone", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) expect(csvCell(evil).replace(/^"/, "")).toMatch(/^'/);
    expect(csvCell("1234.50")).toBe("1234.50");
    expect(csvCell("-12")).toBe("-12");
    expect(csvCell("Rent - October")).toBe("Rent - October");
  });
  it("starts with a byte-order mark and ends rows with CRLF", () => {
    expect(toCsv([["a", "b"], ["1", "₹"]])).toBe("﻿a,b\r\n1,₹\r\n");
  });
});

describe("formatCompact", () => {
  const f = (rupees: number) => formatCompact({ minor: BigInt(Math.round(rupees * 100)), currency: INR });
  it("uses k, lakh and crore for chart axes", () => {
    expect(f(0)).toBe("₹0");
    expect(f(950)).toBe("₹950");
    expect(f(1200)).toBe("₹1.2k");
    expect(f(10000)).toBe("₹10k");
    expect(f(345000)).toBe("₹3.5L");
    expect(f(15000000)).toBe("₹1.5Cr");
    expect(f(-2500)).toBe("-₹2.5k");
  });
});

import { niceTicks } from "@/lib/chart";

describe("niceTicks", () => {
  it("rounds the top of the axis up to a clean number and starts at zero", () => {
    expect(niceTicks(0)).toEqual({ max: 1, ticks: [0, 1] });
    expect(niceTicks(9_300)).toEqual({ max: 10_000, ticks: [0, 2_500, 5_000, 7_500, 10_000] });
    expect(niceTicks(123_450)).toEqual({ max: 150_000, ticks: [0, 50_000, 100_000, 150_000] });
    expect(niceTicks(780)).toEqual({ max: 800, ticks: [0, 200, 400, 600, 800] });
    expect(niceTicks(1)).toMatchObject({ max: 1 });
  });
  it("never needs more than a handful of ticks", () => {
    for (const v of [3, 47, 999, 12_345, 4_999_999, 3.2e9]) expect(niceTicks(v).ticks.length).toBeLessThanOrEqual(6);
    for (const v of [3, 47, 999, 12_345, 4_999_999]) { const t = niceTicks(v); expect(t.max).toBeGreaterThanOrEqual(v); expect(t.ticks.at(-1)).toBe(t.max); }
  });
});
