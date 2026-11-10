import { describe, expect, it } from "vitest";
import { can, effectivePermissions } from "@/domain/policies/permissions";

describe("permissions", () => {
  it("owner has everything, admin lacks org.delete and org.transfer", () => {
    expect(can("owner", {}, "org.delete")).toBe(true);
    expect(can("admin", {}, "org.manage")).toBe(true);
    expect(can("admin", {}, "org.delete")).toBe(false);
    expect(can("admin", {}, "org.transfer")).toBe(false);
  });
  it("member can run and edit but not send, unless granted", () => {
    expect(can("member", {}, "runs.execute")).toBe(true);
    expect(can("member", {}, "bills.edit")).toBe(true);
    expect(can("member", {}, "reports.send")).toBe(false);
    expect(can("member", { "reports.send": true }, "reports.send")).toBe(true);
  });
  it("overrides can revoke a role default", () => {
    expect(can("member", { "runs.execute": false }, "runs.execute")).toBe(false);
  });
  it("viewer is read-only", () => {
    expect(effectivePermissions("viewer")).toEqual([]);
  });
  it("owner cannot be revoked", () => {
    expect(can("owner", { "org.manage": false }, "org.manage")).toBe(true);
  });
});
