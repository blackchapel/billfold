import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import type { ConnectionConfig } from "@/domain/value-objects/connection";
import type { ProbeResult } from "@/domain/ports/services";

const TIMEOUT_MS = 10_000;

interface ServerSettings { host: string; port: number; secure: boolean; username: string }

function settings(config: ConnectionConfig): ServerSettings {
  return { host: String(config.host), port: Number(config.port), secure: config.secure === true, username: String(config.username) };
}

/** Turns driver errors into messages that are useful but never echo credentials or server banners. */
export function friendly(e: unknown): string {
  const text = e instanceof Error ? `${e.name} ${e.message} ${(e as { code?: string }).code ?? ""} ${(e as { responseText?: string }).responseText ?? ""}` : "";
  // Network problems first: their messages can contain the host name, which must not be mistaken for a login failure.
  if (/ENOTFOUND|EAI_AGAIN/i.test(text)) return "That server name could not be found.";
  if (/ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/i.test(text)) return "The server refused the connection. Check the port.";
  if (/timeout|ETIMEDOUT/i.test(text)) return "The server did not answer in time.";
  if (/cert|tls|ssl|self.signed|wrong version/i.test(text)) return "Secure connection failed. Check the port and the SSL/TLS setting.";
  if (/AUTHENTICATIONFAILED|EAUTH|authenticat|credential|login|\b535\b|\b534\b/i.test(text)) return "The server rejected the username or app password.";
  return "Could not connect to the mail server.";
}

export async function probeImap(config: ConnectionConfig, password: string): Promise<ProbeResult> {
  const s = settings(config);
  const client = new ImapFlow({
    host: s.host, port: s.port, secure: s.secure, auth: { user: s.username, pass: password }, logger: false,
    connectionTimeout: TIMEOUT_MS, greetingTimeout: TIMEOUT_MS, socketTimeout: TIMEOUT_MS,
  });
  client.on("error", () => undefined); // surfaced through connect(); avoids an unhandled 'error' event
  try {
    await client.connect();
    await client.logout();
    return { ok: true, message: "Signed in to the mailbox." };
  } catch (e) {
    client.close();
    return { ok: false, message: friendly(e) };
  }
}

export async function probeSmtp(config: ConnectionConfig, password: string): Promise<ProbeResult> {
  const s = settings(config);
  const transport = nodemailer.createTransport({
    host: s.host, port: s.port, secure: s.secure, auth: { user: s.username, pass: password },
    connectionTimeout: TIMEOUT_MS, greetingTimeout: TIMEOUT_MS, socketTimeout: TIMEOUT_MS,
  });
  try {
    await transport.verify();
    return { ok: true, message: "The mail server accepted the login." };
  } catch (e) {
    return { ok: false, message: friendly(e) };
  } finally {
    transport.close();
  }
}
