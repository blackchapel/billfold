import { describe, expect, it, vi } from "vitest";
import { CACHE_TAGS, type CacheTag } from "@/domain/ports/cache";
import { DrizzleAllowlistRepository } from "@/server/infra/repositories/allowlist-repository";
import { DrizzleAuditLogRepository } from "@/server/infra/repositories/audit-log-repository";
import { DrizzleBillRepository } from "@/server/infra/repositories/bill-repository";
import { DrizzleConnectionRepository } from "@/server/infra/repositories/connection-repository";
import { DrizzleConnectionUsage } from "@/server/infra/repositories/connection-usage";
import { DrizzleInviteRepository } from "@/server/infra/repositories/invite-repository";
import { DrizzleMemberRepository } from "@/server/infra/repositories/member-repository";
import { DrizzleOrgRepository } from "@/server/infra/repositories/org-repository";
import { DrizzleRecipientRepository } from "@/server/infra/repositories/recipient-repository";
import { DrizzleRunConfigRepository } from "@/server/infra/repositories/run-config-repository";
import { DrizzleRunItemRepository } from "@/server/infra/repositories/run-item-repository";
import { DrizzleRunRepository } from "@/server/infra/repositories/run-repository";
import { DrizzleSendItemRepository } from "@/server/infra/repositories/send-item-repository";
import { DrizzleSendRepository } from "@/server/infra/repositories/send-repository";
import { DrizzleSourceRepository } from "@/server/infra/repositories/source-repository";
import { DrizzleTemplateRepository } from "@/server/infra/repositories/template-repository";
import { DrizzleUserRepository } from "@/server/infra/repositories/user-repository";
import { invalidating, type Spec } from "@/server/infra/cache/invalidating";
import { MemoryCache } from "@/server/infra/cache/memory-cache";
import { allowKey, orgsKey, SPECS } from "@/server/infra/cache/specs";

/** Every real repository class next to its cache spec. Private helpers of a class are listed in `helpers`. */
const REPOSITORIES: { name: keyof typeof SPECS; cls: { prototype: object }; helpers?: string[] }[] = [
  { name: "allowlist", cls: DrizzleAllowlistRepository }, { name: "users", cls: DrizzleUserRepository },
  { name: "orgs", cls: DrizzleOrgRepository, helpers: ["rowToMembership"] }, { name: "members", cls: DrizzleMemberRepository },
  { name: "invites", cls: DrizzleInviteRepository }, { name: "audit", cls: DrizzleAuditLogRepository },
  { name: "connections", cls: DrizzleConnectionRepository }, { name: "usage", cls: DrizzleConnectionUsage },
  { name: "sources", cls: DrizzleSourceRepository }, { name: "runConfigs", cls: DrizzleRunConfigRepository, helpers: ["sourceIdsFor"] },
  { name: "runs", cls: DrizzleRunRepository }, { name: "runItems", cls: DrizzleRunItemRepository },
  { name: "bills", cls: DrizzleBillRepository, helpers: ["withFiles"] }, { name: "recipients", cls: DrizzleRecipientRepository },
  { name: "templates", cls: DrizzleTemplateRepository }, { name: "sends", cls: DrizzleSendRepository }, { name: "sendItems", cls: DrizzleSendItemRepository },
];

const methodsOf = (cls: { prototype: object }) => Object.getOwnPropertyNames(cls.prototype).filter((m) => m !== "constructor");
const spec = (name: keyof typeof SPECS) => SPECS[name] as unknown as { plain: string[]; cachedReads?: Record<string, unknown>; writes: Record<string, unknown> };

describe("cache invalidation covers every repository method", () => {
  for (const r of REPOSITORIES) {
    it(`${r.name}: every method is classified as plain, a cached read or a write with an effect (add the new one to specs.ts)`, () => {
      const s = spec(r.name);
      const classified = new Set([...s.plain, ...Object.keys(s.cachedReads ?? {}), ...Object.keys(s.writes), ...(r.helpers ?? [])]);
      expect(methodsOf(r.cls).filter((m) => !classified.has(m))).toEqual([]);
      for (const m of [...s.plain, ...Object.keys(s.cachedReads ?? {}), ...Object.keys(s.writes)]) expect(methodsOf(r.cls), `${r.name}.${m} no longer exists`).toContain(m);
    });
  }

  it("every kind of cached data has at least one repository write that bumps it", async () => {
    const seen = new Set<CacheTag>();
    for (const r of REPOSITORIES) {
      for (const method of Object.keys(spec(r.name).writes)) {
        const cache = new MemoryCache();
        const before = await cache.versions("org-1");
        const repo = invalidating(Object.fromEntries([[method, async () => undefined]]), { plain: [], writes: spec(r.name).writes } as Spec<Record<string, () => Promise<void>>>, cache, async () => []);
        await (repo as Record<string, (...a: unknown[]) => Promise<void>>)[method]?.("org-1", "user-1", { orgId: "org-1", ownerId: "user-1" });
        const after = await cache.versions("org-1");
        for (const tag of CACHE_TAGS) if (after?.[tag] !== before?.[tag]) seen.add(tag);
      }
    }
    expect([...seen].sort()).toEqual([...CACHE_TAGS].sort());
  });
});

describe("what each write does to the cache", () => {
  type Loose = Record<string, (...args: unknown[]) => Promise<unknown>>;
  const run = (repo: Loose, name: string, ...args: unknown[]) => (repo[name] as (...a: unknown[]) => Promise<unknown>)(...args);
  const wrap = (name: keyof typeof SPECS, inner: object, members: string[] = []) => {
    const cache = new MemoryCache();
    return { cache, repo: invalidating(inner as Loose, SPECS[name] as unknown as Spec<Loose>, cache, async () => members) };
  };
  const changed = async (cache: MemoryCache, run: () => Promise<unknown>) => {
    const before = await cache.versions("org-1");
    await run();
    const after = await cache.versions("org-1");
    return CACHE_TAGS.filter((t) => before?.[t] !== after?.[t]);
  };

  it("saving a bill bumps bills only; saving a source also gives run configurations a new version when it is removed", async () => {
    const bills = wrap("bills", { record: async () => ({}), list: async () => [] });
    expect(await changed(bills.cache, () => run(bills.repo, "record", "org-1"))).toEqual(["bills"]);
    expect(await changed(bills.cache, () => run(bills.repo, "list", "org-1"))).toEqual([]); // reading changes nothing
    const sources = wrap("sources", { update: async () => ({}), remove: async () => undefined });
    expect(await changed(sources.cache, () => run(sources.repo, "update", "org-1"))).toEqual(["sources"]);
    expect(await changed(sources.cache, () => run(sources.repo, "remove", "org-1"))).toEqual(["sources", "runConfigs"]);
  });
  it("a connection is created with its organisation inside the object, and still bumps that organisation", async () => {
    const { cache, repo } = wrap("connections", { create: async () => ({}) });
    expect(await changed(cache, () => run(repo, "create", { orgId: "org-1" }))).toEqual(["connections"]);
  });
  it("remembers who is allowed in, and forgets the moment the list changes", async () => {
    const inner = { isAllowed: vi.fn(async () => true), add: async () => undefined, remove: async () => undefined, list: async () => [] };
    const { cache, repo } = wrap("allowlist", inner);
    expect(await run(repo, "isAllowed", "Me@Example.com")).toBe(true);
    expect(await run(repo, "isAllowed", "me@example.com")).toBe(true);
    expect(inner.isAllowed).toHaveBeenCalledTimes(1);
    inner.isAllowed.mockResolvedValue(false);
    await run(repo, "remove", "me@example.com");
    expect(await cache.get(allowKey("me@example.com"))).toBeNull();
    expect(await run(repo, "isAllowed", "me@example.com")).toBe(false); // lock-out is immediate, not after the lifetime
  });
  it("remembers a person's organisations and forgets them when their role changes, or the organisation is renamed or removed", async () => {
    const inner = { listForUser: vi.fn(async () => [{ orgId: "org-1" }]), rename: async () => undefined, softDeleteAndShred: async () => undefined, createWithOwner: async () => ({}), slugExists: async () => false, findMembershipBySlug: async () => null, listAll: async () => [] };
    const { cache, repo } = wrap("orgs", inner, ["u1", "u2"]);
    await run(repo, "listForUser", "u1"); await run(repo, "listForUser", "u2");
    await run(repo, "listForUser", "u1");
    expect(inner.listForUser).toHaveBeenCalledTimes(2);
    await run(repo, "rename", "org-1", "New name");
    expect(await cache.get(orgsKey("u1"))).toBeNull();
    expect(await cache.get(orgsKey("u2"))).toBeNull();
    await run(repo, "listForUser", "u1");
    expect(await changed(cache, () => run(repo, "softDeleteAndShred", "org-1"))).toEqual([...CACHE_TAGS]);
    expect(await cache.get(orgsKey("u1"))).toBeNull();
    await run(repo, "createWithOwner", { ownerId: "u9" });
  });
  it("a member change bumps members and drops that person's organisation list", async () => {
    const { cache, repo } = wrap("members", { updateRole: async () => undefined, remove: async () => undefined });
    await cache.set(orgsKey("u1"), "x", 60);
    expect(await changed(cache, () => run(repo, "updateRole", "org-1", "u1", "viewer"))).toEqual(["members"]);
    expect(await cache.get(orgsKey("u1"))).toBeNull();
    await cache.set(orgsKey("u1"), "x", 60);
    await run(repo, "remove", "org-1", "u1");
    expect(await cache.get(orgsKey("u1"))).toBeNull();
  });
  it("a write still succeeds when the cache is down; the data is saved and old screens simply expire", async () => {
    const { cache, repo } = wrap("bills", { record: vi.fn(async () => ({ id: "b1" })) });
    cache.down = true;
    await expect(run(repo, "record", "org-1")).resolves.toEqual({ id: "b1" });
  });
  it("a failing effect never turns a successful write into an error", async () => {
    const inner = { add: async () => undefined };
    const cache = new MemoryCache();
    cache.del = async () => { throw new Error("boom"); };
    const repo = invalidating(inner as Loose, { plain: [], writes: { add: async ({ cache: c }) => c.del("k") } } as Spec<Loose>, cache, async () => []);
    await expect(run(repo, "add", )).resolves.toBeUndefined();
  });
});
