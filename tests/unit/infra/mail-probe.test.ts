import { SMTPServer } from "smtp-server";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { friendly, probeImap, probeSmtp } from "@/server/infra/providers/mail-server-probe";

describe("friendly mail errors", () => {
  const err = (message: string, code?: string) => Object.assign(new Error(message), code ? { code } : {});
  it("puts network problems before login problems, even when the host name contains a keyword", () => {
    expect(friendly(err("getaddrinfo ENOTFOUND no-such-host.invalid", "ENOTFOUND"))).toMatch(/could not be found/);
    expect(friendly(err("connect ECONNREFUSED 127.0.0.1:1", "ECONNREFUSED"))).toMatch(/refused/);
    expect(friendly(err("Connection timeout", "ETIMEDOUT"))).toMatch(/in time/);
    expect(friendly(err("wrong version number"))).toMatch(/Secure connection/);
  });
  it("recognises login failures and hides everything else", () => {
    expect(friendly(err("Invalid login: 535 5.7.8 Authentication failed", "EAUTH"))).toMatch(/username or app password/);
    expect(friendly(err("something odd with user=alice pass=hunter2"))).toBe("Could not connect to the mail server.");
  });
});

describe("probeSmtp against a local SMTP server", () => {
  let server: SMTPServer;
  let port = 0;
  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: false, secure: false, disabledCommands: ["STARTTLS"], allowInsecureAuth: true,
      onAuth(auth, _session, cb) {
        if (auth.username === "bills@example.com" && auth.password === "good-app-password") cb(null, { user: auth.username });
        else cb(new Error("Invalid login"));
      },
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const config = () => ({ host: "127.0.0.1", port, secure: false, username: "bills@example.com" });
  it("accepts the right app password", async () => {
    expect(await probeSmtp(config(), "good-app-password")).toMatchObject({ ok: true });
  });
  it("rejects a wrong password with a safe message that does not echo it", async () => {
    const r = await probeSmtp(config(), "wrong-secret-xyz");
    expect(r).toEqual({ ok: false, message: "The server rejected the username or app password." });
  });
});

describe("probeImap against a local IMAP server", () => {
  type Closable = { listen(port: number, cb?: () => void): void; close(cb?: () => void): void };
  let server: Closable;
  const port = 14393;
  beforeAll(async () => {
    const { createRequire } = await import("node:module");
    const imap = createRequire(import.meta.url)("hoodiecrow-imap") as (opts: unknown) => Closable;
    server = imap({ plugins: ["ID", "UIDPLUS"], users: { "bills@example.com": { password: "good-app-password" } }, storage: { INBOX: { messages: [] } } });
    await new Promise<void>((r) => server.listen(port, r));
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const config = () => ({ host: "127.0.0.1", port, secure: false, username: "bills@example.com" });
  it("signs in with the right app password", async () => {
    expect(await probeImap(config(), "good-app-password")).toMatchObject({ ok: true });
  });
  it("rejects a wrong password with the safe message", async () => {
    expect(await probeImap(config(), "wrong-secret-xyz")).toEqual({ ok: false, message: "The server rejected the username or app password." });
  });
});
