import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newDataKey, open, parseMasterKey, seal } from "@/server/infra/crypto/envelope";
import { HashedInviteCodes } from "@/server/infra/crypto/invite-codes";

describe("envelope encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const key = newDataKey();
    const a = seal(key, "secret");
    expect(open(key, a)).toBe("secret");
    expect(seal(key, "secret")).not.toBe(a);
  });
  it("fails with the wrong key or tampered data", () => {
    const a = seal(newDataKey(), "secret");
    expect(() => open(newDataKey(), a)).toThrow();
    const key = newDataKey();
    const sealed = seal(key, "secret");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => open(key, parts.join("."))).toThrow();
  });
  it("rejects a master key of the wrong length", () => {
    expect(() => parseMasterKey(randomBytes(16).toString("base64"))).toThrow();
    expect(parseMasterKey(randomBytes(32).toString("base64")).length).toBe(32);
  });
});

describe("invite codes", () => {
  it("generates a code whose hash verifies and is case-insensitive", () => {
    const svc = new HashedInviteCodes();
    const { code, hash } = svc.generate();
    expect(code).toMatch(/^[A-Z2-9]{12}$/);
    expect(svc.hash(code.toLowerCase())).toBe(hash);
  });
});
