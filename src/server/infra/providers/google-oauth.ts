import { GOOGLE_SCOPES, type GoogleKind } from "@/domain/value-objects/connection";
import type { GoogleOAuthClient } from "@/domain/ports/services";

export interface GoogleClientCredentials { clientId: string; clientSecret: string }
/** Project A (verified: login + Drive) and project B (unverified: Gmail) are separate Google Cloud projects. */
export interface GoogleProjects { drive: GoogleClientCredentials | null; gmail: GoogleClientCredentials | null }

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const TIMEOUT_MS = 10_000;

interface TokenResponse { access_token?: string; refresh_token?: string; error?: string }

export class GoogleOAuth implements GoogleOAuthClient {
  constructor(private readonly projects: GoogleProjects, private readonly http: typeof fetch = fetch) {}

  private creds(kind: GoogleKind): GoogleClientCredentials {
    const c = kind === "google_drive" ? this.projects.drive : this.projects.gmail;
    if (!c) throw new Error(`Google OAuth is not configured for ${kind}`);
    return c;
  }

  isConfigured(kind: GoogleKind) {
    return (kind === "google_drive" ? this.projects.drive : this.projects.gmail) !== null;
  }

  authorizeUrl(kind: GoogleKind, state: string, redirectUri: string) {
    const params = new URLSearchParams({
      client_id: this.creds(kind).clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES[kind].join(" "),
      state,
      // offline + consent make Google hand back a refresh token every time, including when reconnecting.
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  private async token(kind: GoogleKind, form: Record<string, string>): Promise<TokenResponse> {
    const { clientId, clientSecret } = this.creds(kind);
    const res = await this.http(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...form }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok) throw new Error(`Google token request failed: ${body.error ?? res.status}`);
    return body;
  }

  async exchangeCode(kind: GoogleKind, code: string, redirectUri: string) {
    const t = await this.token(kind, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
    if (!t.access_token) throw new Error("Google returned no access token");
    if (!t.refresh_token) throw new Error("Google returned no refresh token (remove Billfold from your Google account's connected apps and try again)");
    const info = await this.http(USERINFO_URL, { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const { email } = (await info.json().catch(() => ({}))) as { email?: string };
    if (!info.ok || !email) throw new Error("Could not read the Google account email");
    return { refreshToken: t.refresh_token, accountEmail: email.toLowerCase() };
  }

  async accessToken(kind: GoogleKind, refreshToken: string) {
    const t = await this.token(kind, { grant_type: "refresh_token", refresh_token: refreshToken });
    if (!t.access_token) throw new Error("Google returned no access token");
    return t.access_token;
  }

  async revoke(_kind: GoogleKind, refreshToken: string) {
    // No client credentials are needed to revoke; Google identifies the grant by the token itself.
    await this.http(REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }
}
