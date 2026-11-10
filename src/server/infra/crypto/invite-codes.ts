import { createHash, randomBytes } from "node:crypto";
import { INVITE_CODE_LENGTH } from "@/constants/app";
import type { InviteCodeService } from "@/domain/ports/services";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no look-alikes (0/O, 1/I/L)

export class HashedInviteCodes implements InviteCodeService {
  generate() {
    const bytes = randomBytes(INVITE_CODE_LENGTH);
    const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    return { code, hash: this.hash(code) };
  }

  hash(code: string) {
    return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
  }
}
