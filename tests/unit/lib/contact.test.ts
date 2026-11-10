import { describe, expect, it } from "vitest";
import { appHost, contactEmail, operatorName } from "@/lib/contact";

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

describe("operatorName", () => {
  it("accepts a plain name and trims it", () => { expect(operatorName("  Asha Sharma ")).toBe("Asha Sharma"); expect(operatorName("Sharma & Sons")).toBe("Sharma & Sons"); });
  it("is null when unset or not a plain name, so nothing odd reaches the page", () => {
    for (const bad of [undefined, "", " ", "A", "<script>alert(1)</script>", "x".repeat(81), "a\nb"]) expect(operatorName(bad)).toBeNull();
  });
});

describe("appHost", () => {
  it("shows the real address of an https site", () => { expect(appHost("https://billfold.example.com/")).toBe("billfold.example.com"); });
  it("is null for local, plain-http or broken addresses", () => {
    for (const bad of [undefined, "", "http://billfold.example.com", "http://localhost:3000", "https://localhost", "not a url"]) expect(appHost(bad)).toBeNull();
  });
});
