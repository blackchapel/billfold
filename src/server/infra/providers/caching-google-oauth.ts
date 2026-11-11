import { createHash } from "node:crypto";
import type { Cache } from "@/domain/ports/cache";
import type { GoogleKind } from "@/domain/value-objects/connection";
import type { GoogleOAuthClient } from "@/domain/ports/services";
import { open, seal } from "../crypto/envelope";

/** Google's access tokens last an hour; keep them for 45 minutes so one that is about to run out is never handed out. */
const TOKEN_TTL_SECONDS = 45 * 60;

/**
 * Remembers short-lived Google access tokens so that filing or sending many items does not ask Google for a fresh token every time
 * (a round trip of 100 to 300 ms each). A token is a secret: it is stored sealed with the master key, under a name made from a
 * fingerprint of the refresh token, never in clear and never under the refresh token itself. Removing or reconnecting a connection
 * changes or revokes the refresh token, which makes the old entry unreachable (and `revoke` deletes it at once).
 */
export class CachingGoogleOAuth implements GoogleOAuthClient {
  constructor(private readonly inner: GoogleOAuthClient, private readonly cache: Cache, private readonly master: Buffer) {}

  private key(kind: GoogleKind, refreshToken: string) {
    return `gtok:${kind}:${createHash("sha256").update(refreshToken).digest("hex").slice(0, 32)}`;
  }

  isConfigured(kind: GoogleKind) { return this.inner.isConfigured(kind); }
  authorizeUrl(kind: GoogleKind, state: string, redirectUri: string) { return this.inner.authorizeUrl(kind, state, redirectUri); }
  exchangeCode(kind: GoogleKind, code: string, redirectUri: string) { return this.inner.exchangeCode(kind, code, redirectUri); }

  async accessToken(kind: GoogleKind, refreshToken: string) {
    if (!this.cache.enabled) return this.inner.accessToken(kind, refreshToken);
    const key = this.key(kind, refreshToken);
    const hit = await this.cache.get<string>(key);
    if (hit) {
      try { return open(this.master, hit.value); } catch { /* sealed with an old key or damaged: fall through and fetch a new one */ }
    }
    const token = await this.inner.accessToken(kind, refreshToken);
    await this.cache.set(key, seal(this.master, token), TOKEN_TTL_SECONDS);
    return token;
  }

  async revoke(kind: GoogleKind, refreshToken: string) {
    await this.cache.del(this.key(kind, refreshToken));
    await this.inner.revoke(kind, refreshToken);
  }
}
