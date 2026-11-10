import { describe, expect, it, vi } from "vitest";
import { GeminiBillExtractor } from "@/server/infra/providers/gemini-extractor";
import { TextBillExtractor } from "@/server/infra/providers/text-bill-extractor";
import type { BillExtractorInput } from "@/domain/ports/services";

const input = (over: Partial<BillExtractorInput> = {}): BillExtractorInput => ({
  pdfBytes: new TextEncoder().encode("%PDF-fake"), text: "Total amount due: Rs 1,234.50\nDue date: 15/12/2026",
  hints: { sourceName: "Jio mobile", periodKey: "2026-11", currencyCode: "INR" }, model: null, ...over,
});
const answer = (fields: object) => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(fields) }] } }] });
const text = new TextBillExtractor();
const gemini = (http: typeof fetch) => new GeminiBillExtractor("test-key", "gemini-test", text, http);

describe("TextBillExtractor", () => {
  it("reads the label rules and marks itself as the text reader", async () => {
    expect(await text.extract(input())).toMatchObject({ amountMinor: 123450n, dueDate: "2026-12-15", method: "text", confidence: "high", billerName: null });
  });
  it("refuses currencies it does not know", async () => {
    expect(await text.extract(input({ hints: { sourceName: "x", periodKey: "2026-11", currencyCode: "USD" } }))).toMatchObject({ amountMinor: null, confidence: "low" });
  });
});

describe("GeminiBillExtractor", () => {
  it("sends only the PDF and a short instruction, with the key in a header and not in the URL", async () => {
    const http = vi.fn().mockResolvedValue(answer({ biller_name: "Reliance Jio", total_amount_due: "1,234.50", currency: "INR", bill_date: "2026-11-30", due_date: "2026-12-15", confidence: "high" }));
    const out = await gemini(http as unknown as typeof fetch).extract(input({ model: "gemini-custom-1" }));
    expect(out).toEqual({ amountMinor: 123450n, billDate: "2026-11-30", dueDate: "2026-12-15", billerName: "Reliance Jio", confidence: "high", method: "gemini", note: null });
    const [url, init] = http.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-custom-1:generateContent");
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].inline_data).toEqual({ mime_type: "application/pdf", data: Buffer.from(input().pdfBytes).toString("base64") });
    expect(Object.keys(body)).toEqual(["contents", "generationConfig"]);
    expect(body.contents[0].parts[1].text).toContain('"Jio mobile"');
    expect(JSON.stringify(body)).not.toMatch(/password|subject|@/i);
  });
  it("uses the default model when the org's choice looks wrong", async () => {
    const http = vi.fn().mockResolvedValue(answer({ total_amount_due: "10", confidence: "medium" }));
    await gemini(http as unknown as typeof fetch).extract(input({ model: "../../evil?x=1" }));
    expect(String(http.mock.calls[0]?.[0])).toContain("/models/gemini-test:generateContent");
  });
  it("reports a missing or unusable amount as low confidence with a note", async () => {
    const nothing = await gemini(vi.fn().mockResolvedValue(answer({ total_amount_due: null, confidence: "high" })) as unknown as typeof fetch).extract(input());
    expect(nothing).toMatchObject({ amountMinor: null, confidence: "low" });
    expect(nothing.note).toMatch(/enter it by hand/);
    const zero = await gemini(vi.fn().mockResolvedValue(answer({ total_amount_due: "0.00", confidence: "high" })) as unknown as typeof fetch).extract(input());
    expect(zero.amountMinor).toBeNull();
    const nonsense = await gemini(vi.fn().mockResolvedValue(answer({ total_amount_due: "about ten", confidence: "banana" })) as unknown as typeof fetch).extract(input());
    expect(nonsense).toMatchObject({ amountMinor: null, confidence: "low" });
  });
  it("does not accept an amount in another currency", async () => {
    const out = await gemini(vi.fn().mockResolvedValue(answer({ total_amount_due: "50.00", currency: "USD", confidence: "high" })) as unknown as typeof fetch).extract(input());
    expect(out).toMatchObject({ amountMinor: null, confidence: "low" });
    expect(out.note).toMatch(/USD/);
  });
  it("drops invalid dates instead of storing them", async () => {
    const out = await gemini(vi.fn().mockResolvedValue(answer({ total_amount_due: "5", confidence: "high", bill_date: "2026-02-31", due_date: "soon" })) as unknown as typeof fetch).extract(input());
    expect(out).toMatchObject({ billDate: null, dueDate: null, amountMinor: 500n });
  });
  it("falls back to the built-in reader, and says so, when Gemini fails, times out or answers badly", async () => {
    for (const http of [
      vi.fn().mockResolvedValue(new Response("{}", { status: 429 })),
      vi.fn().mockRejectedValue(new Error("network down")),
      vi.fn().mockResolvedValue(Response.json({ candidates: [] })),
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }))),
    ]) {
      const out = await gemini(http as unknown as typeof fetch).extract(input());
      expect(out).toMatchObject({ amountMinor: 123450n, method: "text" });
      expect(out.note).toMatch(/built-in reader was used/);
    }
  });
});
