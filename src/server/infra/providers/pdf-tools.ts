import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import type { PdfTools, UnlockResult } from "@/domain/ports/services";

const isPdf = (bytes: Uint8Array) => Buffer.from(bytes.slice(0, 1024)).includes("%PDF-");
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** PDF handling in pure JavaScript, so it runs on Vercel without any binary (no qpdf, no headless browser). */
export class PdfLibTools implements PdfTools {
  async unlock(bytes: Uint8Array, password: string | null): Promise<UnlockResult> {
    if (!isPdf(bytes)) return { status: "unreadable" };
    try {
      const doc = await PDFDocument.load(bytes);
      // pdf-lib is forgiving: a damaged file can "load" with no pages at all. That is not a bill.
      return doc.getPageCount() > 0 ? { status: "open", bytes, wasLocked: false } : { status: "unreadable" };
    } catch (e) {
      if (!/encrypted/i.test(message(e))) return { status: "unreadable" };
    }
    // Locked. An empty password also opens files that are only restricted for editing or printing.
    try {
      const doc = await PDFDocument.load(bytes, { password: password ?? "" });
      return doc.getPageCount() > 0 ? { status: "open", bytes: await doc.save(), wasLocked: true } : { status: "unreadable" };
    } catch (e) {
      if (/password/i.test(message(e))) return { status: password === null ? "needs_password" : "wrong_password" };
      return { status: "unreadable" };
    }
  }

  async textToPdf({ title, lines }: { title: string; lines: string[] }): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const charset = new Set(font.getCharacterSet());
    // Standard fonts only cover Latin-1; show the rupee sign as "Rs." and anything else unsupported as "?".
    const safe = (text: string) => [...text.replace(/₹/g, "Rs.").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/–|—/g, "-")]
      .map((ch) => (ch === "\n" || charset.has(ch.codePointAt(0) ?? 0) ? ch : "?")).join("");

    const [width, height, margin, size, lead] = [595, 842, 50, 11, 15];
    const maxWidth = width - margin * 2;
    const wrap = (text: string): string[] => {
      const out: string[] = [];
      let line = "";
      for (const word of safe(text).split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
        else { if (line) out.push(line); line = word; }
      }
      out.push(line);
      return out;
    };

    let page = doc.addPage([width, height]);
    let y = height - margin;
    const draw = (text: string, f = font, s = size) => {
      if (y < margin) { page = doc.addPage([width, height]); y = height - margin; }
      page.drawText(text, { x: margin, y, size: s, font: f });
      y -= lead;
    };
    for (const line of wrap(title)) draw(line, bold, 14);
    y -= lead / 2;
    for (const raw of lines.slice(0, 400)) {
      if (!raw.trim()) { y -= lead / 2; continue; }
      for (const line of wrap(raw)) draw(line);
    }
    return doc.save();
  }

  async extractText(bytes: Uint8Array): Promise<string> {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      return (await extractText(pdf, { mergePages: true })).text;
    } catch {
      return "";
    }
  }
}
