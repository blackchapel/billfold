import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { HmacStateSigner } from "@/server/infra/crypto/state-signer";
import { GoogleOAuth } from "@/server/infra/providers/google-oauth";
import { LiveConnectionProbe } from "@/server/infra/providers/connection-probe";

const MASTER = randomBytes(32).toString("base64");

describe("HmacStateSigner", () => {
  it("round-trips a payload and rejects tampering, other keys and expiry", () => {
    let now = 1_000_000;
    const signer = new HmacStateSigner(MASTER, () => now);
    const token = signer.sign({ slug: "home", uid: "u1" }, 600);
    expect(signer.verify(token)).toMatchObject({ slug: "home", uid: "u1" });
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ slug: "other", uid: "u1", exp: 9_999_999 })).toString("base64url");
    expect(signer.verify(`${forged}.${sig}`)).toBeNull();
    expect(signer.verify(`${body}.AAAA`)).toBeNull();
    expect(signer.verify("nonsense")).toBeNull();
    expect(new HmacStateSigner(randomBytes(32).toString("base64"), () => now).verify(token)).toBeNull();
    now += 601_000;
    expect(signer.verify(token)).toBeNull();
  });
});

describe("GoogleOAuth", () => {
  const projects = { drive: { clientId: "a-id", clientSecret: "a-secret" }, gmail: null };
  it("builds the consent URL with the right scopes for each project and asks for a refresh token", () => {
    const url = new URL(new GoogleOAuth(projects).authorizeUrl("google_drive", "st", "https://app.test/cb"));
    expect(url.searchParams.get("client_id")).toBe("a-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/cb");
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/drive"); // full Drive access, so existing folders can be used
    expect(url.searchParams.get("scope")).not.toContain("drive.file");
    expect(url.searchParams.get("scope")).not.toContain("gmail");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });
  it("reports which projects are configured and refuses to use an unconfigured one", () => {
    const g = new GoogleOAuth(projects);
    expect(g.isConfigured("google_drive")).toBe(true);
    expect(g.isConfigured("gmail")).toBe(false);
    expect(() => g.authorizeUrl("gmail", "s", "https://x")).toThrow(/not configured/);
  });
  it("exchanges a code for a refresh token and the account email", async () => {
    const http = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "at", refresh_token: "rt", scope: "openid https://www.googleapis.com/auth/drive email" }))
      .mockResolvedValueOnce(Response.json({ email: "Me@Example.com" }));
    const got = await new GoogleOAuth(projects, http as unknown as typeof fetch).exchangeCode("google_drive", "code", "https://app.test/cb");
    expect(got).toEqual({ refreshToken: "rt", accountEmail: "me@example.com", scopes: ["openid", "https://www.googleapis.com/auth/drive", "email"] });
    const body = (http.mock.calls[0]?.[1] as RequestInit).body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
  });
  it("explains the missing-refresh-token case without leaking tokens", async () => {
    const http = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "secret-access" }));
    await expect(new GoogleOAuth(projects, http as unknown as typeof fetch).exchangeCode("google_drive", "c", "r")).rejects.toThrow(/no refresh token/);
  });
});

describe("GoogleOAuth.revoke", () => {
  it("posts the token to Google's revoke endpoint", async () => {
    const http = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await new GoogleOAuth({ drive: null, gmail: null }, http as unknown as typeof fetch).revoke("gmail", "the-refresh-token");
    expect(String(http.mock.calls[0]?.[0])).toBe("https://oauth2.googleapis.com/revoke");
    expect(((http.mock.calls[0]?.[1] as RequestInit).body as URLSearchParams).get("token")).toBe("the-refresh-token");
  });
});

describe("LiveConnectionProbe (Google)", () => {
  it("reports ok when the API answers and a friendly message when access was revoked", async () => {
    const google = { isConfigured: () => true, authorizeUrl: () => "", exchangeCode: async () => ({ refreshToken: "", accountEmail: "", scopes: [] }), accessToken: vi.fn().mockResolvedValue("at"), revoke: async () => undefined };
    const ok = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await new LiveConnectionProbe(google, ok as unknown as typeof fetch).check("gmail", {}, JSON.stringify({ refreshToken: "rt" }))).toMatchObject({ ok: true });
    google.accessToken.mockRejectedValueOnce(new Error("invalid_grant"));
    const revoked = await new LiveConnectionProbe(google, ok as unknown as typeof fetch).check("gmail", {}, JSON.stringify({ refreshToken: "rt" }));
    expect(revoked).toEqual({ ok: false, message: "Google access was revoked or expired. Reconnect this account." });
  });
  it("flags unreadable stored credentials", async () => {
    const google = { isConfigured: () => true, authorizeUrl: () => "", exchangeCode: async () => ({ refreshToken: "", accountEmail: "", scopes: [] }), accessToken: async () => "", revoke: async () => undefined };
    expect((await new LiveConnectionProbe(google).check("google_drive", {}, "not json")).ok).toBe(false);
  });
});
