import { simpleParser, type ParsedMail } from "mailparser";
import { SMTPServer } from "smtp-server";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GoogleOAuthClient, OutgoingEmail } from "@/domain/ports/services";
import { GmailSender, LiveMailSender, SmtpSender } from "@/server/infra/providers/mail-sender";

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0xff, 0x00, 0x80, 0x0d, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]); // binary-safe
const google: GoogleOAuthClient = {
  isConfigured: () => true, authorizeUrl: () => "", exchangeCode: async () => ({ refreshToken: "", accountEmail: "" }),
  accessToken: async (_k, rt) => `access-for-${rt}`, revoke: async () => undefined,
};

const email = (over: Partial<OutgoingEmail> = {}): OutgoingEmail => ({
  kind: "smtp", config: {}, secretJson: "{}", from: "family@example.com", fromName: "Sharma Home", to: { name: "Asha Sharma", email: "asha@example.com" },
  subject: "Bills for October 2026: ₹3,544.50", text: "Hello\nTotal ₹3,544.50\n", html: "<p>Hello</p><table><tr><td>₹3,544.50</td></tr></table>",
  attachments: [{ filename: "2026-10 Jio - bill.pdf", bytes: pdf, contentType: "application/pdf" }, { filename: "Café ₹.pdf", bytes: new Uint8Array([1, 2, 3]), contentType: "application/pdf" }], ...over,
});

function expectMessage(m: ParsedMail) {
  expect(m.from?.value[0]).toMatchObject({ name: "Sharma Home", address: "family@example.com" });
  expect(m.to).toMatchObject({ value: [{ name: "Asha Sharma", address: "asha@example.com" }] });
  expect(m.subject).toBe("Bills for October 2026: ₹3,544.50");
  expect(m.text).toContain("Total ₹3,544.50");
  expect(m.html).toContain("<table>");
  expect(m.attachments.map((a) => a.filename)).toEqual(["2026-10 Jio - bill.pdf", "Café ₹.pdf"]);
  expect([...m.attachments[0]?.content ?? []]).toEqual([...pdf]);
  expect(m.attachments[0]?.contentType).toBe("application/pdf");
}

describe("SMTP sender against a local SMTP server", () => {
  let server: SMTPServer;
  let port = 0;
  const received: ParsedMail[] = [];
  const logins: string[] = [];
  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: false, secure: false, disabledCommands: ["STARTTLS"], allowInsecureAuth: true,
      onAuth(auth, _s, cb) {
        logins.push(`${auth.username}`);
        if (auth.username === "family@example.com" && auth.password === "app-pw") cb(null, { user: auth.username });
        else cb(new Error("Invalid login"));
      },
      onRcptTo(address, _s, cb) { if (address.address.startsWith("refused")) cb(new Error("550 no such user")); else cb(); },
      onData(stream, _s, cb) { simpleParser(stream).then((m) => { received.push(m); cb(); }, cb); },
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const smtp = (over: Partial<OutgoingEmail> = {}) => email({ config: { host: "127.0.0.1", port, secure: false, username: "family@example.com" }, secretJson: JSON.stringify({ password: "app-pw" }), ...over });

  it("delivers the message with both bodies, the right headers and byte-exact attachments (non-ASCII names included)", async () => {
    await new SmtpSender().send(smtp());
    expect(received).toHaveLength(1);
    expectMessage(received[0] as ParsedMail);
  });
  it("refuses a wrong app password and a refused recipient, without sending anything", async () => {
    const before = received.length;
    await expect(new SmtpSender().send(smtp({ secretJson: JSON.stringify({ password: "nope" }) }))).rejects.toThrow();
    await expect(new SmtpSender().send(smtp({ to: { name: "X", email: "refused@example.com" } }))).rejects.toThrow();
    expect(received).toHaveLength(before);
  });
  it("goes through the live dispatcher too", async () => {
    await new LiveMailSender(google).send(smtp({ subject: "Bills for October 2026: ₹3,544.50" }));
    expect(received).toHaveLength(2);
  });
});

describe("Gmail sender (mocked HTTP)", () => {
  it("posts the whole message, ready to deliver, as the connected account", async () => {
    const http = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json({ id: "sent-1" }));
    await new GmailSender(google, http as unknown as typeof fetch).send(email({ kind: "gmail", secretJson: JSON.stringify({ refreshToken: "rt-1" }) }));
    const [url, init] = http.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer access-for-rt-1");
    const raw = (JSON.parse(String(init.body)) as { raw: string }).raw;
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/); // base64url: safe to put in JSON
    expectMessage(await simpleParser(Buffer.from(raw, "base64url")));
  });
  it("fails with the status only, never the response body, and needs a token", async () => {
    const denied = vi.fn(async () => new Response('{"error":"secret details"}', { status: 403 }));
    await expect(new GmailSender(google, denied as unknown as typeof fetch).send(email({ kind: "gmail", secretJson: JSON.stringify({ refreshToken: "rt" }) }))).rejects.toThrow("Gmail send failed: 403");
    await expect(new GmailSender(google, denied as unknown as typeof fetch).send(email({ kind: "gmail", secretJson: "{}" }))).rejects.toThrow(/refresh token/);
  });
  it("routes by connection kind", async () => {
    const http = vi.fn(async () => Response.json({}));
    await new LiveMailSender(google, http as unknown as typeof fetch).send(email({ kind: "gmail", secretJson: JSON.stringify({ refreshToken: "rt" }) }));
    expect(http).toHaveBeenCalledTimes(1);
  });
});
