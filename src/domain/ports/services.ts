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
