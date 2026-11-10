import { describe, expect, it } from "vitest";
import { needsReview } from "@/domain/value-objects/bill-data";
import { parseBillText, parseDate } from "@/domain/value-objects/bill-text";
import { INR } from "@/domain/value-objects/currency";

const read = (text: string) => parseBillText(text, INR);

describe("reading the amount", () => {
  it("finds the labelled total in the usual formats", () => {
    expect(read("Jio Bill\nTotal amount due: Rs 1,234.50\nThanks")).toMatchObject({ amountMinor: 123450n, confidence: "high", note: null });
    expect(read("Amount Payable ₹ 1,23,456.00 by the due date")).toMatchObject({ amountMinor: 12345600n, confidence: "high" });
    expect(read("Net payable: INR 999")).toMatchObject({ amountMinor: 99900n, confidence: "high" });
    expect(read("Your electricity bill amount ₹2,310")).toMatchObject({ amountMinor: 231000n });
    expect(read("TOTAL AMOUNT PAYABLE Rs.  78.5")).toMatchObject({ amountMinor: 7850n });
  });
  it("prefers the strongest label when several amounts are on the page", () => {
    const out = read("Previous balance: Rs 100\nTotal: 500\nTotal amount due: Rs 300.00\nGrand total 900");
    expect(out.amountMinor).toBe(30000n);
    expect(out.confidence).toBe("high");
  });
  it("is less sure about a bare 'total' and says nothing false about it", () => {
    expect(read("Water charges\nGrand total Rs 640.00 for the month")).toMatchObject({ amountMinor: 64000n, confidence: "medium" });
  });
  it("falls back to the largest currency amount, flagged as low confidence with an explanation", () => {
    const out = read("Item one Rs. 450.00\nItem two Rs. 12.00\nThank you for choosing us");
    expect(out).toMatchObject({ amountMinor: 45000n, confidence: "low" });
    expect(out.note).toMatch(/largest amount/);
  });
  it("reports no amount rather than guessing, and refuses zero", () => {
    expect(read("Dear customer, your statement is attached. Regards, the billing team")).toMatchObject({ amountMinor: null, confidence: "low" });
    expect(read("Total amount due: Rs 0.00\nNothing to pay this month, thanks")).toMatchObject({ amountMinor: null });
  });
  it("recognises a scan with no text", () => {
    const out = read("  \n ");
    expect(out).toMatchObject({ amountMinor: null, confidence: "low" });
    expect(out.note).toMatch(/scan/);
  });
  it("flags what needs a person's eye", () => {
    expect(needsReview({ amountMinor: null, confidence: "high" })).toBe(true);
    expect(needsReview({ amountMinor: 1n, confidence: "low" })).toBe(true);
    expect(needsReview({ amountMinor: 1n, confidence: "medium" })).toBe(false);
  });
});

describe("reading dates", () => {
  it("handles numeric and written dates, day first", () => {
    expect(parseDate("15/12/2026")).toBe("2026-12-15");
    expect(parseDate("5-1-26")).toBe("2026-01-05");
    expect(parseDate("15 Dec 2026")).toBe("2026-12-15");
    expect(parseDate("1st January, 2027")).toBe("2027-01-01");
    expect(parseDate("Dec 15, 2026")).toBe("2026-12-15");
  });
  it("rejects impossible dates and noise", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("13/13/2026")).toBeNull();
    expect(parseDate("hello")).toBeNull();
    expect(parseDate("12/12/1999")).toBeNull();
  });
  it("picks the due and bill dates by their labels", () => {
    const out = read("Bill date: 30 Nov 2026\nTotal amount due: Rs 100\nDue date: 15/12/2026");
    expect(out).toMatchObject({ billDate: "2026-11-30", dueDate: "2026-12-15" });
    expect(read("Pay before 05-12-2026. Total amount due Rs 10.00").dueDate).toBe("2026-12-05");
    expect(read("Total amount due Rs 10.00 and nothing else of note here").dueDate).toBeNull();
  });
});
