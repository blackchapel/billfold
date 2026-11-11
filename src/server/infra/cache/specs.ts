import { CACHE_TAGS, type CacheTag } from "@/domain/ports/cache";
import type {
  AllowlistRepository, AuditLogRepository, BillRepository, ConnectionRepository, ConnectionUsage, InviteRepository, MemberRepository, OrgRepository,
  RecipientRepository, RunConfigRepository, RunItemRepository, RunRepository, SendItemRepository, SendRepository, SourceRepository, TemplateRepository, UserRepository,
} from "@/domain/ports/repositories";
import type { Effect, Spec } from "./invalidating";

/** The org list: short, so a change of membership shows quickly even if a bump was lost. */
export const SHORT_TTL_SECONDS = 60;
/** The login allowlist is also deleted on every change; 10 minutes is only the backstop if that delete is lost. */
export const ALLOWLIST_TTL_SECONDS = 10 * 60;

export const allowKey = (email: string) => `allow:${email.trim().toLowerCase()}`;
export const orgsKey = (userId: string) => `orgs:${userId}`;

/** First argument is the organisation id (the convention for every organisation-owned repository method). */
const bump = (...tags: CacheTag[]): Effect => async ({ args, cache }) => cache.bump(String(args[0]), tags);
/** Bumps tags, and drops the cached organisation list of the person named in the second argument (their membership changed). */
const bumpAndForget = (...tags: CacheTag[]): Effect => async ({ args, cache }) => {
  await cache.bump(String(args[0]), tags);
  await cache.del(orgsKey(String(args[1])));
};
/** Drops the cached organisation list of everyone in the organisation (its name or existence changed). */
const forgetAllMembers: Effect = async ({ args, cache, memberIds }) => cache.del(...(await memberIds(String(args[0]))).map(orgsKey));

export const SPECS = {
  allowlist: {
    plain: ["list"],
    cachedReads: { isAllowed: { key: (a) => allowKey(String(a[0])), ttlSeconds: ALLOWLIST_TTL_SECONDS } },
    writes: {
      add: async ({ args, cache }) => cache.del(allowKey(String(args[0]))),
      remove: async ({ args, cache }) => cache.del(allowKey(String(args[0]))),
    },
  } satisfies Spec<AllowlistRepository>,
  users: { plain: ["upsert", "findById", "setLastActiveOrg", "listAll"], writes: {} } satisfies Spec<UserRepository>, // nothing cached depends on a user's own row
  orgs: {
    plain: ["slugExists", "findMembershipBySlug", "listAll"],
    cachedReads: { listForUser: { key: (a) => orgsKey(String(a[0])), ttlSeconds: SHORT_TTL_SECONDS } },
    writes: {
      createWithOwner: async ({ args, cache }) => cache.del(orgsKey(String((args[0] as { ownerId: string }).ownerId))),
      rename: forgetAllMembers,
      softDeleteAndShred: async (ctx) => { await ctx.cache.bump(String(ctx.args[0]), CACHE_TAGS); await forgetAllMembers(ctx); },
    },
  } satisfies Spec<OrgRepository>,
  members: {
    plain: ["find", "list", "countOwners"],
    writes: { add: bumpAndForget("members"), updateRole: bumpAndForget("members"), setOverrides: bumpAndForget("members"), remove: bumpAndForget("members") },
  } satisfies Spec<MemberRepository>,
  invites: { plain: ["create", "findByCodeHash", "list", "revoke", "consume"], writes: {} } satisfies Spec<InviteRepository>, // the invite list is never cached; accepting one adds a member, which bumps above
  audit: { plain: ["record", "list"], writes: {} } satisfies Spec<AuditLogRepository>, // never cached
  connections: {
    plain: ["list", "find", "findByAccount", "findSecret"],
    writes: {
      create: async ({ args, cache }) => cache.bump((args[0] as { orgId: string }).orgId, ["connections"]),
      replaceSecret: bump("connections"), recordCheck: bump("connections"), remove: bump("connections"),
    },
  } satisfies Spec<ConnectionRepository>,
  usage: { plain: ["namesUsing"], writes: {} } satisfies Spec<ConnectionUsage>,
  sources: { plain: ["list", "find", "findMany", "findByName", "findPasswordCiphertext"], writes: { create: bump("sources"), update: bump("sources"), remove: bump("sources", "runConfigs") } } satisfies Spec<SourceRepository>,
  runConfigs: { plain: ["list", "find", "findByName"], writes: { create: bump("runConfigs"), update: bump("runConfigs"), remove: bump("runConfigs") } } satisfies Spec<RunConfigRepository>,
  runs: { plain: ["find", "list", "counts"], writes: { create: bump("runs"), setStatus: bump("runs") } } satisfies Spec<RunRepository>,
  runItems: {
    plain: ["list", "find"],
    writes: { insertMany: bump("runs"), claimNext: bump("runs"), markDone: bump("runs"), markFailed: bump("runs"), retryFailed: bump("runs"), skipPending: bump("runs") },
  } satisfies Spec<RunItemRepository>,
  bills: {
    plain: ["existingKeys", "find", "list", "findMany", "summary", "reportRows", "findFiles"],
    writes: { record: bump("bills"), createManual: bump("bills"), update: bump("bills"), remove: bump("bills", "runs") }, // run items that pointed at it lose the link
  } satisfies Spec<BillRepository>,
  recipients: { plain: ["list", "find", "findByEmail", "findMany"], writes: { create: bump("recipients"), update: bump("recipients"), remove: bump("recipients") } } satisfies Spec<RecipientRepository>,
  templates: { plain: ["list", "find", "findByName"], writes: { create: bump("templates"), update: bump("templates"), setDefault: bump("templates"), remove: bump("templates") } } satisfies Spec<TemplateRepository>,
  sends: { plain: ["find", "list", "counts", "countSince"], writes: { create: bump("sends"), setStatus: bump("sends") } } satisfies Spec<SendRepository>,
  sendItems: {
    plain: ["list", "find"],
    writes: { insertMany: bump("sends"), claimNext: bump("sends"), markSent: bump("sends"), markFailed: bump("sends"), retryFailed: bump("sends"), skipPending: bump("sends") },
  } satisfies Spec<SendItemRepository>,
};
