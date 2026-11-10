import { describe, expect, it } from "vitest";
import { BUILT_IN_TEMPLATE, fillPlaceholders, unknownPlaceholders, type TemplatePlaceholder } from "@/domain/value-objects/email-template";
import { cleanSubject, escapeHtml, renderSummaryEmail, type SummaryEmailInput } from "@/domain/value-objects/summary-email";

const values: Record<TemplatePlaceholder, string> = { month: "October 2026", org: "Sharma Home", total: "₹3,544.50", bill_count: "2", unpaid_total: "₹1,234.50", sender: "Asha" };

describe("template placeholders", () => {
  it("fills known placeholders, with or without spaces and in any case, and leaves the rest alone", () => {
    expect(fillPlaceholders("Bills for {{month}} ({{ total }}) {{BILL_COUNT}} {{nope}}", values)).toBe("Bills for October 2026 (₹3,544.50) 2 {{nope}}");
    expect(fillPlaceholders(BUILT_IN_TEMPLATE.subject, values)).toBe("Bills for October 2026: ₹3,544.50 across 2 bills");
    expect(fillPlaceholders(BUILT_IN_TEMPLATE.signoff, values)).toBe("Regards,\nAsha");
  });
  it("never evaluates anything and treats values as text", () => {
    expect(fillPlaceholders("{{sender}}", { ...values, sender: "{{month}} <b>x</b> ${1+1}" })).toBe("{{month}} <b>x</b> ${1+1}");
  });
  it("reports unknown placeholders once each so a typo is caught on save", () => {
    expect(unknownPlaceholders("{{month}} {{mnth}} {{ Mnth }} {{bill_count}} {{x}}")).toEqual(["mnth", "x"]);
    expect(unknownPlaceholders(BUILT_IN_TEMPLATE.subject + BUILT_IN_TEMPLATE.intro + BUILT_IN_TEMPLATE.signoff)).toEqual([]);
  });
});

describe("summary email", () => {
  const input = (over: Partial<SummaryEmailInput> = {}): SummaryEmailInput => ({
    orgName: "Sharma Home", periodLabel: "October 2026", subject: "Bills for October 2026", intro: "Hello,\n\nHere are the bills.", signoff: "Regards,\nAsha",
    bills: [
      { biller: "Jio", amountText: "₹1,234.50", dueText: "15 Dec", paid: false, note: null },
      { biller: "Power & Light <Co>", amountText: "₹2,310.00", dueText: null, paid: true, note: "Cash, \"paid\" on the 1st" },
      { biller: "Scan", amountText: null, dueText: null, paid: false, note: null },
    ],
    totalText: "₹3,544.50", unpaidText: "₹1,234.50", attachmentNames: ["jio.pdf", "power.pdf"], ...over,
  });

  it("carries the Billfold wordmark as plain styled text (no remote image to be blocked) and signs the text version", () => {
    const out = renderSummaryEmail(input());
    expect(out.html).toContain(">Billfold</td>");
    expect(out.html).not.toMatch(/<img/i);
    expect(out.text.trimEnd().endsWith("Sent with Billfold")).toBe(true);
  });

  it("builds a text and an HTML version with the same facts", () => {
    const out = renderSummaryEmail(input());
    expect(out.subject).toBe("Bills for October 2026");
    expect(out.text).toContain("October 2026");
    expect(out.text).toContain("Hello,\n\nHere are the bills.");
    expect(out.text).toMatch(/Jio\s+15 Dec\s+₹1,234\.50/);
    expect(out.text).toContain("Total (3): ₹3,544.50");
    expect(out.text).toContain("Not paid yet: ₹1,234.50");
    expect(out.text).toContain("Attached: jio.pdf, power.pdf");
    expect(out.text.endsWith("Regards,\nAsha\n\n--\nSent with Billfold\n")).toBe(true);
    expect(out.html).toContain("<h1");
    expect(out.html).toContain("₹1,234.50");
    expect(out.html).toContain("not known");
    expect(out.html).toContain("Total (3 bills)");
    expect(out.html).toContain("Attached: jio.pdf, power.pdf");
  });

  it("escapes everything that came from a person or a bill, so nothing can add markup or scripts", () => {
    const out = renderSummaryEmail(input({ orgName: "<script>alert(1)</script>", intro: "Hi <img src=x onerror=alert(1)>\n\nLine two", signoff: "A & B", attachmentNames: ["<b>x</b>.pdf"] }));
    expect(out.html).not.toMatch(/<script|<img|<b>x/);
    expect(out.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out.html).toContain("Power &amp; Light &lt;Co&gt;");
    expect(out.html).toContain("Cash, &quot;paid&quot; on the 1st");
    expect(out.html).toContain("A &amp; B");
    expect(out.html).toContain("Hi &lt;img src=x onerror=alert(1)&gt;");
    expect(out.html).toContain("Line two");
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("marks paid bills and keeps line breaks inside a paragraph", () => {
    const out = renderSummaryEmail(input({ intro: "First line\nSecond line" }));
    expect(out.html).toContain("First line<br>Second line");
    expect(out.html).toContain(">paid<");
    expect(out.text).toContain("(paid)");
  });

  it("handles an empty month and a missing intro", () => {
    const out = renderSummaryEmail(input({ bills: [], intro: "", signoff: "", attachmentNames: [], totalText: "₹0.00", unpaidText: "₹0.00" }));
    expect(out.html).toContain("Total (0 bills)");
    expect(out.text).toContain("Total (0): ₹0.00");
    expect(out.text).not.toContain("Attached");
  });

  it("keeps the subject on one line, so it cannot add mail headers", () => {
    expect(cleanSubject("Bills\r\nBcc: someone@evil.example\nfor October")).toBe("Bills Bcc: someone@evil.example for October");
    expect(cleanSubject("x".repeat(400))).toHaveLength(150);
    expect(renderSummaryEmail(input({ subject: "A\r\nBcc: x@y.com" })).subject).not.toMatch(/[\r\n]/);
  });
});
