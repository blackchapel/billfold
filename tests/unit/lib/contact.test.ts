import { describe, expect, it } from "vitest";
import { contactEmail } from "@/lib/contact";

describe("contactEmail", () => {
  it("accepts a plain address and trims it", () => {
    expect(contactEmail(" help@example.com ")).toBe("help@example.com");
  });
  it("is null when unset, blank or not a plain address, so nothing odd reaches a mailto link", () => {
    for (const bad of [undefined, "", "   ", "no-at-sign", "a@b", "a b@example.com", "x@example.com\nBcc: y@example.com", '"><script>@example.com', "<a@example.com>"]) {
      expect(contactEmail(bad)).toBeNull();
    }
  });
});
