import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { buildGmailQuery, GmailSearch } from "@/server/infra/providers/gmail-search";
import { ImapSearch } from "@/server/infra/providers/imap-search";
import { LiveMailSearch } from "@/server/infra/providers/mail-search";
import type { GoogleOAuthClient, MailSearchInput } from "@/domain/ports/services";

const matcher = { senders: ["billing@jio.com", "@airtel.in"], subjectContains: 'bill "x"', attachmentNameContains: null, requireAttachment: true };
const since = new Date("2026-10-01T00:00:00Z");
const before = new Date("2026-11-10T00:00:00Z");

const google: GoogleOAuthClient = {
  isConfigured: () => true, authorizeUrl: () => "", exchangeCode: async () => ({ refreshToken: "", accountEmail: "" }),
  accessToken: async (_k, rt) => `access-for-${rt}`, revoke: async () => undefined,
};

describe("Gmail search", () => {
  it("builds a narrow query from the rules and window", () => {
    const q = buildGmailQuery({ matcher, since, before });
    expect(q).toBe(`from:(billing@jio.com OR @airtel.in) subject:"bill  x " has:attachment after:${since.getTime() / 1000} before:${before.getTime() / 1000}`);
    expect(buildGmailQuery({ matcher: { ...matcher, subjectContains: null, requireAttachment: false }, since, before })).not.toMatch(/subject:|has:attachment/);
  });

  it("lists then reads headers and attachment names only, using the refreshed access token", async () => {
    const calls: string[] = [];
    const http = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push(u);
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer access-for-rt-1");
      if (u.includes("/messages?")) return Response.json({ messages: [{ id: "m1" }, { id: "m2" }] });
      const id = u.includes("/m1?") ? "m1" : "m2";
      return Response.json({
        id, internalDate: String(Date.UTC(2026, 9, 30)),
        payload: {
          headers: [{ name: "From", value: "Jio <billing@jio.com>" }, { name: "Subject", value: `Bill ${id} (abc123)` }],
          parts: [{ filename: "", parts: [{ filename: "", body: { size: 3 } }] }, { filename: id === "m1" ? "bill.pdf" : "", body: { size: 999 } }, { filename: "", parts: [{ filename: "nested.pdf", body: { size: 5 } }] }],
        },
      });
    });
    const out = await new GmailSearch(google, http as unknown as typeof fetch).search({
      kind: "gmail", config: {}, secretJson: JSON.stringify({ refreshToken: "rt-1" }), matcher, since, before, limit: 500,
    } satisfies MailSearchInput);
    expect(out).toEqual([
      { id: "m1", from: "Jio <billing@jio.com>", subject: "Bill m1 (abc123)", date: new Date(Date.UTC(2026, 9, 30)), attachments: [{ name: "bill.pdf", size: 999 }, { name: "nested.pdf", size: 5 }] },
      { id: "m2", from: "Jio <billing@jio.com>", subject: "Bill m2 (abc123)", date: new Date(Date.UTC(2026, 9, 30)), attachments: [{ name: "nested.pdf", size: 5 }] },
    ]);
    expect(calls[0]).toContain("maxResults=100"); // capped
    expect(calls.every((c) => c.startsWith("https://gmail.googleapis.com/"))).toBe(true);
    expect(calls.slice(1).every((c) => /fields=/.test(c) && !/format=raw/.test(c))).toBe(true);
  });

  it("returns nothing for an empty mailbox and fails clearly on API errors or a missing token", async () => {
    const empty = vi.fn(async () => Response.json({}));
    const input = { kind: "gmail" as const, config: {}, secretJson: JSON.stringify({ refreshToken: "rt" }), matcher, since, before, limit: 10 };
    expect(await new GmailSearch(google, empty as unknown as typeof fetch).search(input)).toEqual([]);
    const denied = vi.fn(async () => new Response("{}", { status: 403 }));
    await expect(new GmailSearch(google, denied as unknown as typeof fetch).search(input)).rejects.toThrow(/403/);
    await expect(new GmailSearch(google).search({ ...input, secretJson: "{}" })).rejects.toThrow(/refresh token/);
  });
});

describe("IMAP search against a local IMAP server", () => {
  type Server = { listen(port: number, cb?: () => void): void; close(cb?: () => void): void };
  let server: Server;
  const port = 14394;
  const mime = (from: string, subject: string, attach: boolean) =>
    `From: ${from}\r\nSubject: ${subject}\r\nDate: Fri, 30 Oct 2026 10:00:00 +0000\r\nMessage-ID: <${subject.length}${from.length}@x>\r\nMIME-Version: 1.0\r\n` +
    (attach
      ? `Content-Type: multipart/mixed; boundary="b"\r\n\r\n--b\r\nContent-Type: text/plain\r\n\r\nhi\r\n--b\r\nContent-Type: application/pdf; name="bill.pdf"\r\nContent-Disposition: attachment; filename="bill.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0=\r\n--b--\r\n`
      : `Content-Type: text/plain\r\n\r\nbody\r\n`);

  beforeAll(async () => {
    const imap = createRequire(import.meta.url)("hoodiecrow-imap") as (o: unknown) => Server;
    server = imap({
      plugins: ["ID", "UIDPLUS"], users: { "bills@example.com": { password: "pw" } },
      storage: { INBOX: { messages: [
        { raw: mime("Jio Billing <billing@jio.com>", "Your Jio bill (abc123)", true), internaldate: "30-Oct-2026 10:00:00 +0000" },
        { raw: mime("Someone <x@other.com>", "Lunch?", false), internaldate: "30-Oct-2026 11:00:00 +0000" },
        { raw: mime("Jio Billing <billing@jio.com>", "Old bill (zzz999)", true), internaldate: "02-Jan-2026 10:00:00 +0000" },
      ] } },
    });
    await new Promise<void>((r) => server.listen(port, r));
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const input = (over: Partial<MailSearchInput> = {}): MailSearchInput => ({
    kind: "imap", config: { host: "127.0.0.1", port, secure: false, username: "bills@example.com" }, secretJson: JSON.stringify({ password: "pw" }),
    matcher: { senders: ["@jio.com"], subjectContains: null, attachmentNameContains: null, requireAttachment: true }, since, before, limit: 50, ...over,
  });

  it("finds the sender's mail in the window with its attachment names", async () => {
    const out = await new LiveMailSearch(google).search(input());
    expect(out.map((m) => m.subject)).toEqual(["Your Jio bill (abc123)"]);
    expect(out[0]).toMatchObject({ from: "Jio Billing <billing@jio.com>", attachments: [{ name: "bill.pdf" }] });
    expect(out[0]?.date.toISOString()).toBe("2026-10-30T10:00:00.000Z");
  });
  it("searches several senders and narrows by subject", async () => {
    const wide = await new ImapSearch().search(input({ matcher: { senders: ["billing@jio.com", "x@other.com"], subjectContains: null, attachmentNameContains: null, requireAttachment: false }, since: new Date("2026-01-01T00:00:00Z") }));
    expect(wide.map((m) => m.subject).sort()).toEqual(["Lunch?", "Old bill (zzz999)", "Your Jio bill (abc123)"]);
    const narrow = await new ImapSearch().search(input({ matcher: { senders: ["@jio.com"], subjectContains: "Old", attachmentNameContains: null, requireAttachment: true }, since: new Date("2026-01-01T00:00:00Z") }));
    expect(narrow.map((m) => m.subject)).toEqual(["Old bill (zzz999)"]);
  });
  it("trims to the exact window even when the server only filters by day", async () => {
    const out = await new LiveMailSearch(google).search(input({ since: new Date("2026-10-30T10:30:00Z"), before: new Date("2026-10-31T00:00:00Z") }));
    expect(out).toEqual([]);
  });
  it("fails (so the tester can show a safe message) when the login is wrong", async () => {
    await expect(new ImapSearch().search(input({ secretJson: JSON.stringify({ password: "nope" }) }))).rejects.toThrow();
  });
});
