import type { ConnectionConfig, ConnectionKind, GoogleKind } from "../value-objects/connection";

export interface SecretBox {
  encrypt(orgId: string, plaintext: string): Promise<string>;
  decrypt(orgId: string, ciphertext: string): Promise<string>;
}

export interface Clock {
  now(): Date;
}

export interface InviteCodeService {
  generate(): { code: string; hash: string };
  hash(code: string): string;
}

export interface RateLimiter {
  /** Returns false when the key has exceeded its allowance. */
  allow(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export interface ProbeResult {
  ok: boolean;
  /** Safe to show to users: never contains a password, token or connection string. */
  message: string;
}

/** Checks that stored credentials still work against the real provider. */
export interface ConnectionProbe {
  check(kind: ConnectionKind, config: ConnectionConfig, secretJson: string): Promise<ProbeResult>;
}

export interface GoogleOAuthClient {
  /** False until the matching Google project's client id and secret are set in the environment. */
  isConfigured(kind: GoogleKind): boolean;
  authorizeUrl(kind: GoogleKind, state: string, redirectUri: string): string;
  exchangeCode(kind: GoogleKind, code: string, redirectUri: string): Promise<{ refreshToken: string; accountEmail: string }>;
  accessToken(kind: GoogleKind, refreshToken: string): Promise<string>;
}

/** Signs short-lived values (OAuth state) so they cannot be forged or replayed after expiry. */
export interface StateSigner {
  sign(payload: Record<string, string | number>, ttlSeconds: number): string;
  verify(token: string): Record<string, string | number> | null;
}
