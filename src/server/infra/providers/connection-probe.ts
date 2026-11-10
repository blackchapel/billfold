import { isGoogleKind, type ConnectionConfig, type ConnectionKind, type GoogleKind } from "@/domain/value-objects/connection";
import type { ConnectionProbe, GoogleOAuthClient, ProbeResult } from "@/domain/ports/services";
import { probeImap, probeSmtp } from "./mail-server-probe";

const TIMEOUT_MS = 10_000;

const GOOGLE_CHECKS: Record<GoogleKind, { url: string; ok: string }> = {
  google_drive: { url: "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", ok: "Google Drive is reachable." },
  gmail: { url: "https://gmail.googleapis.com/gmail/v1/users/me/profile", ok: "Gmail is reachable." },
};

/** Chooses the right live check for each kind of connection. */
export class LiveConnectionProbe implements ConnectionProbe {
  constructor(private readonly google: GoogleOAuthClient, private readonly http: typeof fetch = fetch) {}

  async check(kind: ConnectionKind, config: ConnectionConfig, secretJson: string): Promise<ProbeResult> {
    let secret: { refreshToken?: string; password?: string };
    try {
      secret = JSON.parse(secretJson) as typeof secret;
    } catch {
      return { ok: false, message: "The saved credentials are unreadable. Reconnect this account." };
    }
    if (isGoogleKind(kind)) return this.checkGoogle(kind, secret.refreshToken ?? "");
    const password = secret.password ?? "";
    return kind === "imap" ? probeImap(config, password) : probeSmtp(config, password);
  }

  private async checkGoogle(kind: GoogleKind, refreshToken: string): Promise<ProbeResult> {
    try {
      const token = await this.google.accessToken(kind, refreshToken);
      const res = await this.http(GOOGLE_CHECKS[kind].url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return { ok: true, message: GOOGLE_CHECKS[kind].ok };
      return { ok: false, message: res.status === 401 || res.status === 403 ? "Google denied access. Reconnect this account." : "Google could not be reached." };
    } catch {
      return { ok: false, message: "Google access was revoked or expired. Reconnect this account." };
    }
  }
}
