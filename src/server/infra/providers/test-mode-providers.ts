import type { ConnectionConfig, ConnectionKind, GoogleKind } from "@/domain/value-objects/connection";
import type { MessageSummary } from "@/domain/value-objects/source-rules";
import type { ConnectionProbe, GoogleOAuthClient, MailSearch, MailSearchInput, ProbeResult } from "@/domain/ports/services";
import { withinWindow } from "./mail-search";

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

/** A tiny fake mailbox: one Jio-style bill with the password in the subject, one electricity bill, one newsletter. */
export class StubMailSearch implements MailSearch {
  async search(input: MailSearchInput): Promise<MessageSummary[]> {
    const daysAgo = (n: number) => new Date(input.before.getTime() - n * 86_400_000);
    const all: MessageSummary[] = [
      { id: "1", from: "Jio Billing <billing@jio.com>", subject: "Your Jio bill is ready (abc123)", date: daysAgo(5), attachments: [{ name: "jio-bill.pdf", size: 52_000 }] },
      { id: "2", from: "Power Co <noreply@powerco.example>", subject: "Electricity bill November", date: daysAgo(9), attachments: [{ name: "bill-nov.pdf", size: 31_000 }] },
      { id: "3", from: "News <news@powerco.example>", subject: "Our newsletter", date: daysAgo(12), attachments: [] },
    ];
    return withinWindow(all, input.since, input.before);
  }
}
