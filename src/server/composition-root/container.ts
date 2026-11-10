import "server-only";
import { env, googleProjects, superAdminEmails } from "../infra/config/env";
import { db } from "../infra/db/client";
import { isTestMode } from "../infra/auth/test-mode";
import { GoogleDriveStore } from "../infra/providers/drive-store";
import { GeminiBillExtractor } from "../infra/providers/gemini-extractor";
import { LiveMailFetch } from "../infra/providers/mail-fetch";
import { LiveMailSearch } from "../infra/providers/mail-search";
import { PdfLibTools } from "../infra/providers/pdf-tools";
import { StubConnectionProbe, StubDriveStore, StubGoogleOAuth, StubMailFetch, StubMailSearch, StubMailSender } from "../infra/providers/test-mode-providers";
import { TextBillExtractor } from "../infra/providers/text-bill-extractor";
import { HmacStateSigner } from "../infra/crypto/state-signer";
import { GoogleOAuth } from "../infra/providers/google-oauth";
import { CachingGoogleOAuth } from "../infra/providers/caching-google-oauth";
import { parseMasterKey } from "../infra/crypto/envelope";
import { LiveConnectionProbe } from "../infra/providers/connection-probe";
import { DrizzleBillRepository } from "../infra/repositories/bill-repository";
import { DrizzleRunItemRepository } from "../infra/repositories/run-item-repository";
import { DrizzleRunRepository } from "../infra/repositories/run-repository";
import { DrizzleConnectionRepository } from "../infra/repositories/connection-repository";
import { DrizzleConnectionUsage } from "../infra/repositories/connection-usage";
import { DrizzleRunConfigRepository } from "../infra/repositories/run-config-repository";
import { DrizzleSourceRepository } from "../infra/repositories/source-repository";
import { OrgSecretBox } from "../infra/crypto/org-secret-box";
import { HashedInviteCodes } from "../infra/crypto/invite-codes";
import { DrizzleAllowlistRepository } from "../infra/repositories/allowlist-repository";
import { DrizzleAuditLogRepository } from "../infra/repositories/audit-log-repository";
import { DrizzleInviteRepository } from "../infra/repositories/invite-repository";
import { DrizzleMemberRepository } from "../infra/repositories/member-repository";
import { DrizzleOrgRepository } from "../infra/repositories/org-repository";
import { PostgresRateLimiter } from "../infra/repositories/rate-limiter";
import type { Cache } from "@/domain/ports/cache";
import type { MemberRepository } from "@/domain/ports/repositories";
import { invalidating } from "../infra/cache/invalidating";
import { MemoryCache } from "../infra/cache/memory-cache";
import { NoopCache } from "../infra/cache/noop-cache";
import { SPECS } from "../infra/cache/specs";
import { UpstashCache } from "../infra/cache/upstash-cache";
import { DrizzleUserRepository } from "../infra/repositories/user-repository";
import { ManageAllowlist } from "../application/allowlist";
import { CheckAllConnections } from "../application/connection-health";
import { AddMailAccount, ListConnections, RemoveConnection, TestConnection, UpdateMailPassword } from "../application/connections";
import { CreateManualBill, ListBills, MarkBillChecked, SetBillDeleted, SetBillPaid, UpdateBill } from "../application/bills";
import { ReportService } from "../application/report-service";
import { ProcessNextItem } from "../application/run-processor";
import { DeleteRecipient, ListRecipients, SaveRecipient } from "../application/recipients";
import { DeleteTemplate, ListTemplates, SaveTemplate, SetDefaultTemplate } from "../application/email-templates";
import { SendComposer } from "../application/send-composer";
import { CancelSend, PreviewSend, ProcessNextSendItem, ReadSends, RetrySendItems, StartSend } from "../application/sends";
import { LiveMailSender } from "../infra/providers/mail-sender";
import { DrizzleRecipientRepository } from "../infra/repositories/recipient-repository";
import { DrizzleTemplateRepository } from "../infra/repositories/template-repository";
import { DrizzleSendRepository } from "../infra/repositories/send-repository";
import { DrizzleSendItemRepository } from "../infra/repositories/send-item-repository";
import { CancelRun, ListRuns, RetryRunItems, StartRun } from "../application/runs";
import { DeleteRunConfig, ListRunConfigs, SaveRunConfig } from "../application/run-configs";
import { TestSource } from "../application/source-tester";
import { DeleteSource, ListSources, SaveSource } from "../application/sources";
import { CompleteGoogleConnect } from "../application/google-connect";
import { AuthorizationService } from "../application/authorization";
import { CreateOrg } from "../application/create-org";
import { AcceptInvite, CreateInvite, RevokeInvite } from "../application/invites";
import { ChangeMemberRole, RemoveMember, SetMemberOverrides } from "../application/members";
import { DeleteOrg, RenameOrg, TransferOwnership } from "../application/org-admin";
import { SignInGate } from "../application/sign-in-gate";

const systemClock = { now: () => new Date() };

function build() {
  const database = db();
  const cache: Cache = env().UPSTASH_REDIS_REST_URL && env().UPSTASH_REDIS_REST_TOKEN
    ? new UpstashCache(env().UPSTASH_REDIS_REST_URL as string, env().UPSTASH_REDIS_REST_TOKEN as string)
    : isTestMode() ? new MemoryCache() : new NoopCache();
  // Every repository is wrapped so that saving data bumps the cache versions that depend on it (see infra/cache/specs.ts).
  const rawMembers = new DrizzleMemberRepository(database);
  const memberIds = async (orgId: string) => (await rawMembers.list(orgId)).map((m) => m.userId);
  const allowlist = invalidating(new DrizzleAllowlistRepository(database), SPECS.allowlist, cache, memberIds);
  const users = invalidating(new DrizzleUserRepository(database), SPECS.users, cache, memberIds);
  const orgs = invalidating(new DrizzleOrgRepository(database, env().MASTER_ENCRYPTION_KEY), SPECS.orgs, cache, memberIds);
  const members = invalidating<MemberRepository>(rawMembers, SPECS.members, cache, memberIds);
  const invites = invalidating(new DrizzleInviteRepository(database), SPECS.invites, cache, memberIds);
  const audit = invalidating(new DrizzleAuditLogRepository(database), SPECS.audit, cache, memberIds);
  const limiter = new PostgresRateLimiter(database);
  const codes = new HashedInviteCodes();
  const authz = new AuthorizationService(orgs, members);
  const connections = invalidating(new DrizzleConnectionRepository(database), SPECS.connections, cache, memberIds);
  const secretBox = new OrgSecretBox(database, env().MASTER_ENCRYPTION_KEY);
  const googleRaw = isTestMode() ? new StubGoogleOAuth() : new GoogleOAuth(googleProjects());
  // Access tokens are remembered (sealed) between requests when a cache is configured; test mode keeps its stand-in as it is.
  const google = !isTestMode() && cache.enabled ? new CachingGoogleOAuth(googleRaw, cache, parseMasterKey(env().MASTER_ENCRYPTION_KEY)) : googleRaw;
  const sources = invalidating(new DrizzleSourceRepository(database), SPECS.sources, cache, memberIds);
  const runConfigs = invalidating(new DrizzleRunConfigRepository(database), SPECS.runConfigs, cache, memberIds);
  const usage = invalidating(new DrizzleConnectionUsage(database), SPECS.usage, cache, memberIds);
  const mailSearch = isTestMode() ? new StubMailSearch() : new LiveMailSearch(google);
  const runRepo = invalidating(new DrizzleRunRepository(database), SPECS.runs, cache, memberIds);
  const runItemRepo = invalidating(new DrizzleRunItemRepository(database), SPECS.runItems, cache, memberIds);
  const billRepo = invalidating(new DrizzleBillRepository(database), SPECS.bills, cache, memberIds);
  const mailFetch = isTestMode() ? new StubMailFetch() : new LiveMailFetch(google);
  const driveStore = isTestMode() ? new StubDriveStore() : new GoogleDriveStore(google, fetch, cache);
  const textReader = new TextBillExtractor();
  const reader = !isTestMode() && env().GEMINI_API_KEY ? new GeminiBillExtractor(env().GEMINI_API_KEY as string, env().GEMINI_MODEL ?? "gemini-2.5-flash", textReader) : textReader;
  const pdfTools = new PdfLibTools();
  const recipientRepo = invalidating(new DrizzleRecipientRepository(database), SPECS.recipients, cache, memberIds);
  const templateRepo = invalidating(new DrizzleTemplateRepository(database), SPECS.templates, cache, memberIds);
  const sendRepo = invalidating(new DrizzleSendRepository(database), SPECS.sends, cache, memberIds);
  const sendItemRepo = invalidating(new DrizzleSendItemRepository(database), SPECS.sendItems, cache, memberIds);
  const mailSender = isTestMode() ? new StubMailSender() : new LiveMailSender(google);
  const composer = new SendComposer(billRepo, templateRepo, orgs, users);
  const probe = isTestMode() ? new StubConnectionProbe() : new LiveConnectionProbe(google);

  return {
    cache,
    repos: { allowlist, users, orgs, members, invites, audit, connections, bills: billRepo },
    secretBox,
    google,
    stateSigner: new HmacStateSigner(env().MASTER_ENCRYPTION_KEY),
    authz,
    signInGate: new SignInGate(allowlist, users, superAdminEmails()),
    createOrg: new CreateOrg(orgs, users, audit),
    renameOrg: new RenameOrg(orgs, authz, audit),
    transferOwnership: new TransferOwnership(members, authz, audit),
    deleteOrg: new DeleteOrg(orgs, authz, audit),
    createInvite: new CreateInvite(invites, authz, codes, systemClock, audit),
    revokeInvite: new RevokeInvite(invites, authz, audit),
    acceptInvite: new AcceptInvite(invites, members, orgs, users, codes, systemClock, limiter, audit),
    changeMemberRole: new ChangeMemberRole(members, authz, audit),
    setMemberOverrides: new SetMemberOverrides(members, authz, audit),
    removeMember: new RemoveMember(members, authz, audit),
    listConnections: new ListConnections(connections),
    addMailAccount: new AddMailAccount(connections, authz, secretBox, probe, systemClock, audit),
    testConnection: new TestConnection(connections, authz, secretBox, probe, systemClock),
    removeConnection: new RemoveConnection(connections, authz, audit, secretBox, google, usage),
    updateMailPassword: new UpdateMailPassword(connections, authz, secretBox, probe, systemClock, audit),
    checkAllConnections: new CheckAllConnections(orgs, connections, secretBox, probe, systemClock),
    completeGoogleConnect: new CompleteGoogleConnect(connections, authz, secretBox, google, probe, systemClock, audit),
    listSources: new ListSources(sources),
    saveSource: new SaveSource(sources, connections, authz, secretBox, audit),
    deleteSource: new DeleteSource(sources, authz, audit),
    testSource: new TestSource(connections, authz, secretBox, mailSearch, systemClock),
    listRunConfigs: new ListRunConfigs(runConfigs),
    saveRunConfig: new SaveRunConfig(runConfigs, sources, connections, authz, audit),
    deleteRunConfig: new DeleteRunConfig(runConfigs, authz, audit),
    startRun: new StartRun(runRepo, runItemRepo, runConfigs, sources, connections, billRepo, authz, secretBox, mailSearch, systemClock, audit),
    processNextItem: new ProcessNextItem(runRepo, runItemRepo, sources, connections, billRepo, authz, secretBox, mailFetch, pdfTools, reader, driveStore, systemClock, audit),
    cancelRun: new CancelRun(runRepo, runItemRepo, authz, systemClock, audit),
    retryRunItems: new RetryRunItems(runRepo, runItemRepo, authz, audit),
    listRuns: new ListRuns(runRepo, runItemRepo, billRepo),
    updateBill: new UpdateBill(billRepo, authz, systemClock, audit),
    createManualBill: new CreateManualBill(billRepo, authz, systemClock, audit),
    markBillChecked: new MarkBillChecked(billRepo, authz, systemClock, audit),
    setBillPaid: new SetBillPaid(billRepo, authz, systemClock, audit),
    setBillDeleted: new SetBillDeleted(billRepo, authz, systemClock, audit),
    listBills: new ListBills(billRepo),
    reports: new ReportService(billRepo, systemClock),
    saveRecipient: new SaveRecipient(recipientRepo, authz, audit),
    deleteRecipient: new DeleteRecipient(recipientRepo, authz, audit),
    listRecipients: new ListRecipients(recipientRepo),
    saveTemplate: new SaveTemplate(templateRepo, authz, audit),
    setDefaultTemplate: new SetDefaultTemplate(templateRepo, authz, audit),
    deleteTemplate: new DeleteTemplate(templateRepo, authz, audit),
    listTemplates: new ListTemplates(templateRepo),
    previewSend: new PreviewSend(composer, authz),
    startSend: new StartSend(composer, sendRepo, sendItemRepo, recipientRepo, connections, users, authz, limiter, audit),
    processNextSendItem: new ProcessNextSendItem(sendRepo, sendItemRepo, billRepo, connections, users, authz, secretBox, driveStore, mailSender, systemClock),
    cancelSend: new CancelSend(sendRepo, sendItemRepo, authz, systemClock, audit),
    retrySendItems: new RetrySendItems(sendRepo, sendItemRepo, authz, audit),
    readSends: new ReadSends(sendRepo, sendItemRepo),
    testOutbox: mailSender instanceof StubMailSender ? mailSender : null,
    manageAllowlist: new ManageAllowlist(allowlist, audit),
  };
}

export type Container = ReturnType<typeof build>;

// Kept on globalThis so the pages, server actions and route handlers of one dev server share a single container (and, in test
// mode, the same in-memory stand-ins) even though the bundler may load this module more than once.
const holder = globalThis as typeof globalThis & { __billfoldContainer?: Container };

/** The only place concrete implementations are wired to ports. */
export function container(): Container {
  if (!holder.__billfoldContainer) holder.__billfoldContainer = build();
  return holder.__billfoldContainer;
}
