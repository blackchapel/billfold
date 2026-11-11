import { ORG_UTC_OFFSET_MINUTES } from "@/constants/app";
import { DomainError } from "@/domain/errors/domain-error";
import type { AuditLogRepository, BillRepository, ConnectionRepository, RunConfigRepository, RunItemRepository, RunRepository, SourceRepository } from "@/domain/ports/repositories";
import type { BillRecord, NewRunItem, RunCounts, RunItemRecord, RunRecord, SourceRecord } from "@/domain/ports/records";
import type { Clock, MailSearch, SecretBox } from "@/domain/ports/services";
import { MAX_ITEM_ATTEMPTS, type RunStatus } from "@/domain/value-objects/bill-data";
import { redactSubjectPassword } from "@/domain/value-objects/password-rule";
import { isPeriodKey, periodKeyFor, periodRange, resolvePeriod } from "@/domain/value-objects/period";
import { matchesMessage, type MessageSummary } from "@/domain/value-objects/source-rules";
import type { AuthorizationService } from "./authorization";

const SEARCH_LIMIT = 200;
const MAX_MONTHS_BACK = 36;

const isPdfName = (name: string) => /\.pdf$/i.test(name);
const keyOf = (sourceId: string, messageId: string, attachment: string | null) => `${sourceId}:${messageId}:${attachment ?? ""}`;

/** Which run status the counts imply, or null while there is still work to do. */
export function finishedStatus(counts: RunCounts): Extract<RunStatus, "completed" | "completed_with_errors"> | null {
  if (counts.pending + counts.processing > 0) return null;
  return counts.failed > 0 ? "completed_with_errors" : "completed";
}

export interface RunOverview { run: RunRecord; counts: RunCounts }
export interface RunDetail extends RunOverview { items: RunItemRecord[]; bills: Map<string, BillRecord> }

/**
 * Starts a run: looks in each source's mailbox for the chosen month and lists every email (or PDF) to file.
 * Nothing is downloaded here. Filing happens afterwards, one item per request, in `ProcessNextItem`.
 */
export class StartRun {
  constructor(
    private readonly runs: RunRepository,
    private readonly items: RunItemRepository,
    private readonly runConfigs: RunConfigRepository,
    private readonly sources: SourceRepository,
    private readonly connections: ConnectionRepository,
    private readonly bills: BillRepository,
    private readonly authz: AuthorizationService,
    private readonly secrets: SecretBox,
    private readonly search: MailSearch,
    private readonly clock: Clock,
    private readonly audit: AuditLogRepository,
  ) {}

  /** The months a person may pick: this month and the previous 36, newest first. */
  static selectablePeriods(now: Date): string[] {
    const out: string[] = [];
    let key = periodKeyFor(now, ORG_UTC_OFFSET_MINUTES);
    for (let i = 0; i <= MAX_MONTHS_BACK; i++) {
      out.push(key);
      const [y, m] = key.split("-").map(Number) as [number, number];
      key = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    }
    return out;
  }

  async execute(input: { actorId: string; orgId: string; runConfigId: string; periodKey?: string | null }): Promise<RunOverview> {
    await this.authz.require(input.actorId, input.orgId, "runs.execute");
    const config = await this.runConfigs.find(input.orgId, input.runConfigId);
    if (!config) throw new DomainError("not_found", "Run configuration not found");
    const now = this.clock.now();
    const periodKey = input.periodKey || resolvePeriod(config.periodMode, now, ORG_UTC_OFFSET_MINUTES).key;
    if (!isPeriodKey(periodKey) || !StartRun.selectablePeriods(now).includes(periodKey)) throw new DomainError("validation", "Choose a month from the list.");

    const drive = await this.connections.find(input.orgId, config.driveConnectionId);
    if (!drive || drive.kind !== "google_drive") throw new DomainError("validation", "The Google Drive for this run configuration is no longer connected. Edit the configuration and choose a Drive.");
    const sources = await this.sources.findMany(input.orgId, config.sourceIds);
    if (sources.length === 0) throw new DomainError("validation", "This run configuration has no sources left. Edit it and add one.");

    const range = periodRange(periodKey, ORG_UTC_OFFSET_MINUTES);
    const items: NewRunItem[] = [];
    for (const source of sources) items.push(...(await this.plan(input.orgId, source, range, now)));

    const filed = await this.bills.existingKeys(input.orgId, items.filter((i) => i.status === "pending").map((i) => i.itemKey));
    for (const item of items) {
      if (item.status !== "pending" || !filed.has(item.itemKey)) continue;
      item.status = "skipped";
      item.error = filed.get(item.itemKey)
        ? "You deleted this bill and chose not to file it again. Restore it from Bills > Deleted, or remove it there so the next run files it."
        : "Already filed in an earlier run.";
    }

    const run = await this.runs.create(input.orgId, {
      runConfigId: config.id, configName: config.name, periodKey, driveConnectionId: drive.id, driveFolder: config.driveFolder, startedBy: input.actorId,
    });
    await this.items.insertMany(input.orgId, run.id, items);
    const counts = (await this.runs.counts(input.orgId, [run.id])).get(run.id) ?? { pending: 0, processing: 0, done: 0, failed: 0, skipped: 0 };
    const done = finishedStatus(counts);
    if (done) await this.runs.setStatus(input.orgId, run.id, done, now);
    await this.audit.record({
      orgId: input.orgId, actorUserId: input.actorId, action: "run.started", entityType: "run", entityId: run.id,
      metadata: { config: config.name, period: periodKey, pending: counts.pending, skipped: counts.skipped, failed: counts.failed },
    });
    return { run: { ...run, status: done ?? "processing", finishedAt: done ? now : null }, counts };
  }

  /** Looks in one source's mailbox. A mailbox that cannot be read becomes a visible failed item, not a silent gap. */
  private async plan(orgId: string, source: SourceRecord, range: { start: Date; end: Date }, now: Date): Promise<NewRunItem[]> {
    const problem = (error: string): NewRunItem => ({
      sourceId: source.id, sourceName: source.name, messageId: "-", messageDate: now, fromAddress: "", subject: "", attachmentName: null,
      itemKey: `${source.id}:source-problem`, status: "failed", error,
    });
    const mailbox = await this.connections.find(orgId, source.connectionId);
    const cipher = mailbox ? await this.connections.findSecret(orgId, mailbox.id) : null;
    if (!mailbox || !cipher || (mailbox.kind !== "gmail" && mailbox.kind !== "imap")) return [problem("This source's mailbox is no longer connected.")];

    let found: MessageSummary[];
    try {
      found = await this.search.search({
        kind: mailbox.kind, config: mailbox.config, secretJson: await this.secrets.decrypt(orgId, cipher),
        matcher: source.matcher, since: range.start, before: range.end, limit: SEARCH_LIMIT,
      });
    } catch {
      return [problem("Could not read this source's mailbox. Test the connection on the Connections page.")];
    }

    const out: NewRunItem[] = [];
    for (const message of found.filter((m) => matchesMessage(source.matcher, m))) {
      const base = {
        sourceId: source.id, sourceName: source.name, messageId: message.id, messageDate: message.date,
        fromAddress: message.from.match(/<([^>]+)>/)?.[1]?.toLowerCase() ?? message.from.toLowerCase(),
        subject: redactSubjectPassword(source.passwordMode, source.passwordPattern, message.subject).slice(0, 300),
      };
      const pdfs = message.attachments.filter((a) => isPdfName(a.name));
      if (pdfs.length > 0) {
        for (const pdf of pdfs) out.push({ ...base, attachmentName: pdf.name, itemKey: keyOf(source.id, message.id, pdf.name), status: "pending", error: null });
      } else if (!source.matcher.requireAttachment) {
        out.push({ ...base, attachmentName: null, itemKey: keyOf(source.id, message.id, null), status: "pending", error: null }); // the bill is the email itself
      } else {
        out.push({ ...base, attachmentName: message.attachments[0]?.name ?? null, itemKey: keyOf(source.id, message.id, message.attachments[0]?.name ?? null), status: "skipped", error: "No PDF attachment in this email." });
      }
    }
    return out;
  }
}

export class CancelRun {
  constructor(
    private readonly runs: RunRepository,
    private readonly items: RunItemRepository,
    private readonly authz: AuthorizationService,
    private readonly clock: Clock,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: { actorId: string; orgId: string; runId: string }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "runs.execute");
    const run = await this.runs.find(input.orgId, input.runId);
    if (!run) throw new DomainError("not_found", "Run not found");
    if (run.status !== "processing") throw new DomainError("validation", "This run has already finished.");
    const skipped = await this.items.skipPending(input.orgId, run.id, "Run cancelled before this was filed.");
    await this.runs.setStatus(input.orgId, run.id, "cancelled", this.clock.now());
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "run.cancelled", entityType: "run", entityId: run.id, metadata: { skipped } });
  }
}

/** Puts failed items back in the queue (one, or all of them). Items that failed too many times need a fix first. */
export class RetryRunItems {
  constructor(
    private readonly runs: RunRepository,
    private readonly items: RunItemRepository,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: { actorId: string; orgId: string; runId: string; itemId: string | null }): Promise<number> {
    await this.authz.require(input.actorId, input.orgId, "runs.execute");
    const run = await this.runs.find(input.orgId, input.runId);
    if (!run) throw new DomainError("not_found", "Run not found");
    if (run.status === "cancelled") throw new DomainError("validation", "This run was cancelled. Start a new run instead.");
    const n = await this.items.retryFailed(input.orgId, run.id, MAX_ITEM_ATTEMPTS, input.itemId);
    if (n === 0) throw new DomainError("validation", `Nothing to retry. An item that has failed ${MAX_ITEM_ATTEMPTS} times needs its source or connection fixed first.`);
    if (run.status !== "processing") await this.runs.setStatus(input.orgId, run.id, "processing", null);
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "run.retried", entityType: "run", entityId: run.id, metadata: { items: n } });
    return n;
  }
}

/** Any member may see runs and what they filed. */
export class ListRuns {
  constructor(private readonly runs: RunRepository, private readonly items: RunItemRepository, private readonly bills: BillRepository) {}

  async recent(orgId: string, limit = 20): Promise<RunOverview[]> {
    const runs = await this.runs.list(orgId, limit);
    const counts = await this.runs.counts(orgId, runs.map((r) => r.id));
    return runs.map((run) => ({ run, counts: counts.get(run.id) ?? { pending: 0, processing: 0, done: 0, failed: 0, skipped: 0 } }));
  }

  async detail(orgId: string, runId: string): Promise<RunDetail | null> {
    const run = await this.runs.find(orgId, runId);
    if (!run) return null;
    const [items, counts] = await Promise.all([this.items.list(orgId, runId), this.runs.counts(orgId, [runId])]);
    // Only the bills this run's items point at, not every bill of the month.
    const bills = await this.bills.findMany(orgId, items.flatMap((i) => (i.billId ? [i.billId] : [])));
    return { run, items, counts: counts.get(runId) ?? { pending: 0, processing: 0, done: 0, failed: 0, skipped: 0 }, bills: new Map(bills.map((b) => [b.id, b])) };
  }

}
