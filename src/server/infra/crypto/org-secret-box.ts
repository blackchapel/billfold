import { eq, desc } from "drizzle-orm";
import type { SecretBox } from "@/domain/ports/services";
import type { Db } from "../db/create";
import { orgKeys } from "../db/schema";
import { open, parseMasterKey, seal } from "./envelope";

/** Envelope encryption: the master key wraps each org's data key; the data key encrypts secrets. */
export class OrgSecretBox implements SecretBox {
  private readonly master: Buffer;
  private readonly cache = new Map<string, Buffer>();

  constructor(private readonly db: Db, masterKeyBase64: string) {
    this.master = parseMasterKey(masterKeyBase64);
  }

  private async dataKey(orgId: string): Promise<Buffer> {
    const hit = this.cache.get(orgId);
    if (hit) return hit;
    const [row] = await this.db.select().from(orgKeys).where(eq(orgKeys.orgId, orgId)).orderBy(desc(orgKeys.keyVersion)).limit(1);
    if (!row) throw new Error("No encryption key for org (crypto-shredded or missing)");
    const key = Buffer.from(open(this.master, row.wrappedDataKey), "base64");
    this.cache.set(orgId, key);
    return key;
  }

  async encrypt(orgId: string, plaintext: string) {
    return seal(await this.dataKey(orgId), plaintext);
  }

  async decrypt(orgId: string, ciphertext: string) {
    return open(await this.dataKey(orgId), ciphertext);
  }
}

