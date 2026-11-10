import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { GmailFetch } from "@/server/infra/providers/gmail-fetch";
import { LiveMailFetch } from "@/server/infra/providers/mail-fetch";
import type { GoogleOAuthClient, MailFetchInput } from "@/domain/ports/services";

const pdf = readFileSync("tests/fixtures/pdf/plain.pdf");
const google: GoogleOAuthClient = {
  isConfigured: () => true, authorizeUrl: () => "", exchangeCode: async () => ({ refreshToken: "", accountEmail: "" }),
  accessToken: async (_k, rt) => `access-for-${rt}`, revoke: async () => undefined,
};
const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

describe("Gmail fetch", () => {
  const gmailInput = (over: Partial<MailFetchInput> = {}): MailFetchInput => ({
    kind: "gmail", config: {}, secretJson: JSON.stringify({ refreshToken: "rt-1" }), messageId: "m1", attachmentName: "bill.pdf", ...over,
  });
  const message = (payload: object) => ({ id: "m1", internalDate: String(Date.UTC(2026, 9, 30)), payload: { headers: [{ name: "From", value: "Jio <billing@jio.com>" }, { name: "Subject", value: "Bill (abc123)" }], ...payload } });

  it("downloads a large attachment through the attachments endpoint, and reads the plain text body", async () => {
    const calls: string[] = [];
    const http = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push(u);
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer access-for-rt-1");
      if (u.includes("/attachments/")) return Response.json({ data: b64(pdf) });
      return Response.json(message({ mimeType: "multipart/mixed", parts: [
        { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", filename: "", body: { data: b64("Total amount due: Rs 5") } }] },
        { mimeType: "application/pdf", filename: "bill.pdf", body: { size: pdf.length, attachmentId: "att-9" } },
      ] }));
    });
    const out = await new GmailFetch(google, http as unknown as typeof fetch).fetch(gmailInput());
    expect(Buffer.from(out.attachment?.bytes ?? []).equals(pdf)).toBe(true);
    expect(out).toMatchObject({ subject: "Bill (abc123)", from: "Jio <billing@jio.com>", date: new Date(Date.UTC(2026, 9, 30)), bodyText: "Total amount due: Rs 5" });
    expect(calls[1]).toContain("/messages/m1/attachments/att-9");
  });

  it("reads small inline attachments, turns an HTML-only body into text, and skips attachments when none is wanted", async () => {
    const http = vi.fn(async () => Response.json(message({ mimeType: "multipart/mixed", parts: [
      { mimeType: "text/html", filename: "", body: { data: b64("<p>Amount&nbsp;payable: <b>Rs 7</b></p>") } },
      { mimeType: "application/pdf", filename: "bill.pdf", body: { size: 3, data: b64("PDF") } },
    ] })));
    const g = new GmailFetch(google, http as unknown as typeof fetch);
    expect((await g.fetch(gmailInput())).attachment?.bytes).toEqual(new Uint8Array(Buffer.from("PDF")));
    const bodyOnly = await g.fetch(gmailInput({ attachmentName: null }));
    expect(bodyOnly.attachment).toBeNull();
    expect(bodyOnly.bodyText).toBe("Amount payable: Rs 7");
  });

  it("fails clearly when the attachment is missing, too big, empty, or Gmail refuses", async () => {
    const part = (body: object) => vi.fn(async () => Response.json(message({ parts: [{ mimeType: "application/pdf", filename: "bill.pdf", body }] })));
    await expect(new GmailFetch(google, part({ size: 1 }) as unknown as typeof fetch).fetch(gmailInput({ attachmentName: "other.pdf" }))).rejects.toThrow(/not found/);
    await expect(new GmailFetch(google, part({ size: 26 * 1024 * 1024, attachmentId: "x" }) as unknown as typeof fetch).fetch(gmailInput())).rejects.toThrow(/too large/);
    await expect(new GmailFetch(google, part({ size: 0 }) as unknown as typeof fetch).fetch(gmailInput())).rejects.toThrow(/no content/);
    await expect(new GmailFetch(google, vi.fn(async () => new Response("{}", { status: 404 })) as unknown as typeof fetch).fetch(gmailInput())).rejects.toThrow(/404/);
    await expect(new GmailFetch(google).fetch(gmailInput({ secretJson: "{}" }))).rejects.toThrow(/refresh token/);
  });
});

describe("IMAP fetch against a local IMAP server", () => {
  type Server = { listen(port: number, cb?: () => void): void; close(cb?: () => void): void };
  let server: Server;
  const port = 14395;
  const raw = (subject: string, withPdf: boolean) =>
    `From: Jio Billing <billing@jio.com>\r\nSubject: ${subject}\r\nDate: Fri, 30 Oct 2026 10:00:00 +0000\r\nMessage-ID: <${subject.length}@x>\r\nMIME-Version: 1.0\r\n` +
    (withPdf
      ? `Content-Type: multipart/mixed; boundary="b"\r\n\r\n--b\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nTotal amount due: Rs 1,234.50\r\n--b\r\nContent-Type: application/pdf; name="bill.pdf"\r\nContent-Disposition: attachment; filename="bill.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\n${pdf.toString("base64").replace(/(.{76})/g, "$1\r\n")}\r\n--b--\r\n`
      : `Content-Type: text/html\r\n\r\n<p>Amount payable: <b>Rs 99.00</b></p>\r\n`);

  beforeAll(async () => {
    const imap = createRequire(import.meta.url)("hoodiecrow-imap") as (o: unknown) => Server;
    server = imap({ plugins: ["ID", "UIDPLUS"], users: { "bills@example.com": { password: "pw" } }, storage: { INBOX: { messages: [
      { raw: raw("Your Jio bill (abc123)", true), internaldate: "30-Oct-2026 10:00:00 +0000" },
      { raw: raw("HTML only", false), internaldate: "30-Oct-2026 11:00:00 +0000" },
    ] } } });
    await new Promise<void>((r) => server.listen(port, r));
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const imapInput = (over: Partial<MailFetchInput> = {}): MailFetchInput => ({
    kind: "imap", config: { host: "127.0.0.1", port, secure: false, username: "bills@example.com" }, secretJson: JSON.stringify({ password: "pw" }), messageId: "1", attachmentName: "bill.pdf", ...over,
  });
  const live = new LiveMailFetch(google);

  it("downloads the PDF byte for byte, with the real subject and the text body", async () => {
    const out = await live.fetch(imapInput());
    expect(Buffer.from(out.attachment?.bytes ?? []).equals(pdf)).toBe(true);
    expect(out).toMatchObject({ subject: "Your Jio bill (abc123)", bodyText: "Total amount due: Rs 1,234.50" });
    expect(out.from).toContain("billing@jio.com");
    expect(out.date.toISOString()).toBe("2026-10-30T10:00:00.000Z");
  });
  it("reads an HTML-only email as text when no attachment is wanted", async () => {
    const out = await live.fetch(imapInput({ messageId: "2", attachmentName: null }));
    expect(out.attachment).toBeNull();
    expect(out.bodyText).toBe("Amount payable: Rs 99.00");
  });
  it("fails for a missing attachment, a missing email or a wrong login", async () => {
    await expect(live.fetch(imapInput({ attachmentName: "other.pdf" }))).rejects.toThrow(/not found/);
    await expect(live.fetch(imapInput({ messageId: "99" }))).rejects.toThrow();
    await expect(live.fetch(imapInput({ secretJson: JSON.stringify({ password: "nope" }) }))).rejects.toThrow();
  });
});
