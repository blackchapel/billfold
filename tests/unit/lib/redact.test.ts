import { describe, expect, it } from "vitest";
import { redactObject, redactSecrets, redactTrailingBracket } from "@/lib/redact";

describe("redaction", () => {
  it("removes every occurrence of a secret", () => {
    expect(redactSecrets("a hunter22 b hunter22", ["hunter22"])).toBe("a [redacted] b [redacted]");
  });
  it("ignores empty or tiny secrets so it never mangles text", () => {
    expect(redactSecrets("abc", ["", "a"])).toBe("abc");
  });
  it("masks a trailing bracketed password in a subject", () => {
    expect(redactTrailingBracket("E-Bill for Jio Number 81xxxxxx34 (Abcd1234)")).toBe("E-Bill for Jio Number 81xxxxxx34 [redacted]");
  });
  it("masks sensitive keys and nested values", () => {
    const out = redactObject({ password: "x", nested: { token: "t", note: "has s3cret inside" }, list: ["s3cret"] }, ["s3cret"]);
    expect(out).toEqual({ password: "[redacted]", nested: { token: "[redacted]", note: "has [redacted] inside" }, list: ["[redacted]"] });
  });
});
