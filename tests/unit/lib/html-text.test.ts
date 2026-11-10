import { describe, expect, it } from "vitest";
import { htmlToText } from "@/lib/html-text";

describe("htmlToText", () => {
  it("keeps the readable text and line breaks, drops scripts, styles and tags", () => {
    const html = "<html><head><style>p{color:red}</style></head><body><script>alert(1)</script><p>Total amount due:&nbsp;&#8377; 1,234.50</p><p>Due <b>15/12/2026</b><br>Thanks &amp; regards</p></body></html>";
    expect(htmlToText(html)).toBe("Total amount due: ₹ 1,234.50\nDue 15/12/2026\nThanks & regards");
  });
  it("lays table cells out on one line and ignores bad numeric entities", () => {
    expect(htmlToText("<table><tr><td>Amount</td><td>Rs 99</td></tr></table>x&#0;y&#99999999999;z")).toBe("Amount Rs 99\n\nxyz");
  });
});
