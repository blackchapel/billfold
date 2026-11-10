import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const VERSION = "v1";

/** Encrypts to "v1.<iv>.<tag>.<ciphertext>" (base64url parts). */
export function seal(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, body].map((p, i) => (i === 0 ? p : (p as Buffer).toString("base64url"))).join(".");
}

export function open(key: Buffer, sealed: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !body) throw new Error("Unsupported ciphertext format");
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

export function newDataKey(): Buffer {
  return randomBytes(32);
}

export function parseMasterKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("MASTER_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}
