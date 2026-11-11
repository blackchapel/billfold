import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PdfLibTools } from "@/server/infra/providers/pdf-tools";

const tools = new PdfLibTools();
const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/pdf/${name}.pdf`));
const ALGORITHMS = ["rc4-40", "rc4-128", "aes-128", "aes-256-r5", "aes-256"];

describe("unlocking PDFs (every common encryption method)", () => {
  for (const name of ALGORITHMS) {
    it(`opens ${name} with the right password and keeps the text readable`, async () => {
      const out = await tools.unlock(fixture(name), "abc123");
      expect(out).toMatchObject({ status: "open", wasLocked: true });
      if (out.status !== "open") return;
      expect(await tools.extractText(out.bytes)).toContain("Total amount due: Rs 1,234.50");
      expect(await tools.unlock(out.bytes, null)).toMatchObject({ status: "open", wasLocked: false }); // really decrypted
    });
    it(`refuses ${name} with a wrong or missing password`, async () => {
      expect(await tools.unlock(fixture(name), "wrong")).toEqual({ status: "wrong_password" });
      expect(await tools.unlock(fixture(name), null)).toEqual({ status: "needs_password" });
    });
  }

  it("returns an unlocked PDF untouched, byte for byte", async () => {
    const plain = fixture("plain");
    const out = await tools.unlock(plain, "ignored");
    expect(out).toMatchObject({ status: "open", wasLocked: false });
    if (out.status === "open") expect(Buffer.from(out.bytes).equals(Buffer.from(plain))).toBe(true);
  });

  it("opens a file that is only restricted (empty user password) without needing a password", async () => {
    const doc = await PDFDocument.create();
    doc.addPage().drawText("Total amount due: Rs 10.00", { font: await doc.embedFont(StandardFonts.Helvetica), size: 12 });
    doc.encrypt({ userPassword: "", ownerPassword: "owner-only", permissions: { printing: "highResolution" } });
    const out = await tools.unlock(await doc.save(), null);
    expect(out).toMatchObject({ status: "open", wasLocked: true });
  });

  it("does not choke on things that are not PDFs", async () => {
    expect(await tools.unlock(new TextEncoder().encode("<html>not a pdf</html>"), null)).toEqual({ status: "unreadable" });
    expect(await tools.unlock(new Uint8Array(0), null)).toEqual({ status: "unreadable" });
    expect(await tools.unlock(new TextEncoder().encode("%PDF-1.7\n garbage garbage"), null)).toEqual({ status: "unreadable" });
    expect(await tools.extractText(new TextEncoder().encode("nope"))).toBe("");
  });
});

describe("building a PDF from email text", () => {
  it("makes a readable PDF, turning the rupee sign into Rs. and unsupported characters into ?", async () => {
    const bytes = await tools.textToPdf({ title: "Electricity bill – November", lines: ["Total amount due: ₹ 2,310.00", "", "Café ☂ umbrella"] });
    const text = await tools.extractText(bytes);
    expect(text).toContain("Total amount due: Rs. 2,310.00");
    expect(text).toContain("Electricity bill - November");
    expect(text).toMatch(/Caf. \? umbrella/);
    expect(await tools.unlock(bytes, null)).toMatchObject({ status: "open", wasLocked: false });
  });
  it("wraps long lines and starts new pages", async () => {
    const lines = Array.from({ length: 120 }, (_, i) => `Line ${i} ${"word ".repeat(30)}`);
    const bytes = await tools.textToPdf({ title: "Long", lines });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
    expect(await tools.extractText(bytes)).toContain("Line 0");
  });
});
