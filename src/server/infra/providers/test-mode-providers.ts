import type { ConnectionConfig, ConnectionKind, GoogleKind } from "@/domain/value-objects/connection";
import type { ConnectionProbe, GoogleOAuthClient, ProbeResult } from "@/domain/ports/services";

/** Offline stand-ins used only when test mode is on (never in production), so Playwright can run without Google or mail servers. */
export const TEST_GOOD_PASSWORD = "good-app-password";

export class StubConnectionProbe implements ConnectionProbe {
  async check(_kind: ConnectionKind, _config: ConnectionConfig, secretJson: string): Promise<ProbeResult> {
    const secret = JSON.parse(secretJson) as { password?: string; refreshToken?: string };
    if (secret.refreshToken === "test-refresh" || secret.password === TEST_GOOD_PASSWORD) return { ok: true, message: "Test mode: connection is fine." };
    return { ok: false, message: "The server rejected the username or app password." };
  }
}

/** The "Google consent screen" is the callback itself, so the whole state/cookie round trip is still exercised. */
export class StubGoogleOAuth implements GoogleOAuthClient {
  revoked: string[] = [];
  isConfigured() { return true; }
  authorizeUrl(kind: GoogleKind, state: string, redirectUri: string) {
    return `${redirectUri}?code=test-${kind}&state=${encodeURIComponent(state)}`;
  }
  async exchangeCode(kind: GoogleKind) {
    return { refreshToken: "test-refresh", accountEmail: `${kind === "gmail" ? "mailbox" : "drive"}@example.com` };
  }
  async accessToken() { return "test-access"; }
  async revoke(_kind: GoogleKind, refreshToken: string) { this.revoked.push(refreshToken); }
}
