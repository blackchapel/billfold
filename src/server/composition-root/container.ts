import "server-only";
import { env, googleProjects, superAdminEmails } from "../infra/config/env";
import { db } from "../infra/db/client";
import { isTestMode } from "../infra/auth/test-mode";
import { GoogleDriveStore } from "../infra/providers/drive-store";
import { GeminiBillExtractor } from "../infra/providers/gemini-extractor";
import { LiveMailFetch } from "../infra/providers/mail-fetch";
import { LiveMailSearch } from "../infra/providers/mail-search";
import { PdfLibTools } from "../infra/providers/pdf-tools";
import { StubConnectionProbe, StubDriveStore, StubGoogleOAuth, StubMailFetch, StubMailSearch } from "../infra/providers/test-mode-providers";
import { TextBillExtractor } from "../infra/providers/text-bill-extractor";
import { HmacStateSigner } from "../infra/crypto/state-signer";
import { GoogleOAuth } from "../infra/providers/google-oauth";
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
import { DrizzleUserRepository } from "../infra/repositories/user-repository";
import { ManageAllowlist } from "../application/allowlist";
import { CheckAllConnections } from "../application/connection-health";
import { AddMailAccount, ListConnections, RemoveConnection, TestConnection, UpdateMailPassword } from "../application/connections";
import { CreateManualBill, ListBills, MarkBillChecked, SetBillDeleted, SetBillPaid, UpdateBill } from "../application/bills";
import { ReportService } from "../application/report-service";
import { ProcessNextItem } from "../application/run-processor";
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
  const allowlist = new DrizzleAllowlistRepository(database);
  const users = new DrizzleUserRepository(database);
  const orgs = new DrizzleOrgRepository(database, env().MASTER_ENCRYPTION_KEY);
  const members = new DrizzleMemberRepository(database);
  const invites = new DrizzleInviteRepository(database);
  const audit = new DrizzleAuditLogRepository(database);
  const limiter = new PostgresRateLimiter(database);
  const codes = new HashedInviteCodes();
  const authz = new AuthorizationService(orgs, members);
  const connections = new DrizzleConnectionRepository(database);
  const secretBox = new OrgSecretBox(database, env().MASTER_ENCRYPTION_KEY);
  const google = isTestMode() ? new StubGoogleOAuth() : new GoogleOAuth(googleProjects());
  const sources = new DrizzleSourceRepository(database);
  const runConfigs = new DrizzleRunConfigRepository(database);
  const usage = new DrizzleConnectionUsage(database);
  const mailSearch = isTestMode() ? new StubMailSearch() : new LiveMailSearch(google);
  const runRepo = new DrizzleRunRepository(database);
  const runItemRepo = new DrizzleRunItemRepository(database);
  const billRepo = new DrizzleBillRepository(database);
  const mailFetch = isTestMode() ? new StubMailFetch() : new LiveMailFetch(google);
  const driveStore = isTestMode() ? new StubDriveStore() : new GoogleDriveStore(google);
  const textReader = new TextBillExtractor();
  const reader = !isTestMode() && env().GEMINI_API_KEY ? new GeminiBillExtractor(env().GEMINI_API_KEY as string, env().GEMINI_MODEL ?? "gemini-2.5-flash", textReader) : textReader;
  const pdfTools = new PdfLibTools();
  const probe = isTestMode() ? new StubConnectionProbe() : new LiveConnectionProbe(google);

  return {
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
    manageAllowlist: new ManageAllowlist(allowlist, audit),
  };
}

export type Container = ReturnType<typeof build>;

let instance: Container | null = null;

/** The only place concrete implementations are wired to ports. */
export function container(): Container {
  if (!instance) instance = build();
  return instance;
}
