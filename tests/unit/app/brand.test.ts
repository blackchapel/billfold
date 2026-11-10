import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import robots from "@/app/robots";

/** Width and height from a PNG's header, so a wrongly sized or corrupt file fails here instead of on someone's phone. */
function pngSize(path: string): { width: number; height: number } {
  const b = readFileSync(path);
  expect(b.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

describe("brand files", () => {
  it("has every icon at the size its name promises", () => {
    expect(pngSize("public/icon-192.png")).toEqual({ width: 192, height: 192 });
    expect(pngSize("public/icon-512.png")).toEqual({ width: 512, height: 512 });
    expect(pngSize("src/app/apple-icon.png")).toEqual({ width: 180, height: 180 });
    expect(pngSize("src/app/opengraph-image.png")).toEqual({ width: 1200, height: 630 });
  });
  it("has alt text for the social image", () => {
    expect(readFileSync("src/app/opengraph-image.alt.txt", "utf8").trim().length).toBeGreaterThan(10);
  });
  it("lists the two app icons in the manifest, which point at files that exist", () => {
    const m = manifest();
    expect(m.icons?.map((i) => i.sizes)).toEqual(["192x192", "512x512"]);
    for (const icon of m.icons ?? []) expect(() => readFileSync(`public${icon.src}`)).not.toThrow();
    expect(m).toMatchObject({ name: "Billfold", start_url: "/", display: "standalone" });
  });
  it("lets search engines see only the front page and the legal pages", () => {
    const rule = Array.isArray(robots().rules) ? robots().rules[0] : robots().rules;
    expect(rule).toMatchObject({ allow: ["/$", "/privacy", "/terms"], disallow: "/" });
  });
});
