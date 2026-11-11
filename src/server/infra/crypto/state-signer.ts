import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { StateSigner } from "@/domain/ports/services";
import { parseMasterKey } from "./envelope";

const b64 = (b: Buffer) => b.toString("base64url");

/** HMAC-signed, expiring tokens. The key is derived from the master key so no extra secret has to be configured. */
export class HmacStateSigner implements StateSigner {
  private readonly key: Buffer;

  constructor(masterKeyBase64: string, private readonly now: () => number = () => Date.now()) {
    this.key = Buffer.from(hkdfSync("sha256", parseMasterKey(masterKeyBase64), Buffer.alloc(0), "billfold-oauth-state", 32));
  }

  private mac(body: string): Buffer {
    return createHmac("sha256", this.key).update(body).digest();
  }

  sign(payload: Record<string, string | number>, ttlSeconds: number): string {
    const body = b64(Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(this.now() / 1000) + ttlSeconds })));
    return `${body}.${b64(this.mac(body))}`;
  }

  verify(token: string): Record<string, string | number> | null {
    const [body, sig, extra] = token.split(".");
    if (!body || !sig || extra !== undefined) return null;
    const expected = this.mac(body);
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, string | number>;
      return typeof payload.exp === "number" && payload.exp * 1000 > this.now() ? payload : null;
    } catch {
      return null;
    }
  }
}
