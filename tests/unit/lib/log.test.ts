import { describe, expect, it } from "vitest";
import { safeMessage } from "@/lib/log";

describe("safeMessage", () => {
  it("strips URLs such as connection strings and truncates long text", () => {
    expect(safeMessage(new Error("connect failed postgres://user:pw@host:5432/db now"))).toBe("connect failed [url] now");
    expect(safeMessage("x".repeat(1000)).length).toBe(300);
  });
});
