import { DEFAULT_CURRENCY } from "@/constants/app";
import { DomainError } from "@/domain/errors/domain-error";
import type { AuditLogRepository, BillRepository, ConnectionRepository, RunItemRepository, RunRepository, SourceRepository } from "@/domain/ports/repositories";
import type { BillRecord, RunCounts, RunItemRecord, RunRecord, SourceRecord } from "@/domain/ports/records";
import type { BillExtractor, Clock, DriveStore, MailFetch, PdfTools, SecretBox } from "@/domain/ports/services";
import { needsReview } from "@/domain/value-objects/bill-data";
import { extractSubjectPassword } from "@/domain/value-objects/password-rule";
import { errorFields, logEvent } from "@/lib/log";
import { sha256Hex } from "@/lib/hash";
import type { AuthorizationService } from "./authorization";
import { finishedStatus } from "./runs";

/** A processing item is considered abandoned (its request died) after this long and is handed out again. */
const STALE_AFTER_MS = 5 * 60_000;

/** A problem with one item, worded for the person looking at the run. Everything else is hidden behind a generic message. */
class ItemFailure extends Error {}

export interface StepResult {
  run: RunRecord;
  counts: RunCounts;
  /** The item that was just worked on, or null when nothing was left to do. */
  item: RunItemRecord | null;
  bill: BillRecord | null;
  /** True when no pending work remains, so the caller can stop asking. */
  finished: boolean;
}

/**
 * Files the next waiting item of a run: download, unlock, read the amount, put the PDF in Drive, save the bill.
 * Exactly one item per call, so a request stays short and a failure only ever affects that one item.
 */
export class ProcessNextItem {
  constructor(
    private readonly runs: RunRepository,
    private readonly items: RunItemRepository,
    private readonly sources: SourceRepository,
    private readonly connections: ConnectionRepository,
    private readonly bills: BillRepository,
    private readonly authz: AuthorizationService,
    private readonly secrets: SecretBox,
    private readonly mail: MailFetch,
    private readonly pdf: PdfTools,
    private readonly extractor: BillExtractor,
    private readonly drive: DriveStore,
    private readonly clock: Clock,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: { actorId: string; orgId: string; runId: string }): Promise<StepResult> {
    await this.authz.require(input.actorId, input.orgId, "runs.execute");
    let run = await this.runs.find(input.orgId, input.runId);
    if (!run) throw new DomainError("not_found", "Run not found");
    if (run.status === "cancelled") return this.result(run, null, null);

    const claimed = await this.items.claimNext(input.orgId, run.id, new Date(this.clock.now().getTime() - STALE_AFTER_MS));
    if (!claimed) return this.result((await this.finalise(run)) ?? run, null, null);

    let bill: BillRecord | null = null;
    try {
      bill = await this.file(run, claimed, input.actorId);
      await this.items.markDone(input.orgId, claimed.id, bill.id);
    } catch (e) {
      const message = e instanceof ItemFailure || e instanceof DomainError ? e.message : "Something went wrong while filing this bill. Try again.";
      if (!(e instanceof ItemFailure)) logEvent("run_item_failed", { run: run.id, item: claimed.id, ...errorFields(e) });
      await this.items.markFailed(input.orgId, claimed.id, message);
    }
    run = (await this.finalise(run)) ?? run;
    return this.result(run, await this.items.find(input.orgId, claimed.id), bill);
  }

  /** Marks the run finished once nothing is pending or in progress. */
  private async finalise(run: RunRecord): Promise<RunRecord | null> {
    const counts = (await this.runs.counts(run.orgId, [run.id])).get(run.id);
    const status = counts ? finishedStatus(counts) : null;
    if (!status || run.status === status) return status ? run : null;
    const now = this.clock.now();
    await this.runs.setStatus(run.orgId, run.id, status, now);
    return { ...run, status, finishedAt: now };
  }

  private async result(run: RunRecord, item: RunItemRecord | null, bill: BillRecord | null): Promise<StepResult> {
    const counts = (await this.runs.counts(run.orgId, [run.id])).get(run.id) ?? { pending: 0, processing: 0, done: 0, failed: 0, skipped: 0 };
    return { run, counts, item, bill, finished: counts.pending + counts.processing === 0 || run.status === "cancelled" };
  }

  private async file(run: RunRecord, item: RunItemRecord, actorId: string): Promise<BillRecord> {
    const orgId = run.orgId;
    const source = item.sourceId ? await this.sources.find(orgId, item.sourceId) : null;
    if (!source) throw new ItemFailure("This source was deleted after the run started.");
    const mailbox = await this.connections.find(orgId, source.connectionId);
    const mailCipher = mailbox ? await this.connections.findSecret(orgId, mailbox.id) : null;
    if (!mailbox || !mailCipher || (mailbox.kind !== "gmail" && mailbox.kind !== "imap")) throw new ItemFailure("This source's mailbox is no longer connected.");
    const drive = run.driveConnectionId ? await this.connections.find(orgId, run.driveConnectionId) : null;
    const driveCipher = drive ? await this.connections.findSecret(orgId, drive.id) : null;
    if (!drive || !driveCipher) throw new ItemFailure("The Google Drive for this run is no longer connected.");

    let fetched;
    try {
      fetched = await this.mail.fetch({
        kind: mailbox.kind, config: mailbox.config, secretJson: await this.secrets.decrypt(orgId, mailCipher),
        messageId: item.messageId, attachmentName: item.attachmentName,
      });
    } catch (e) {
      logEvent("run_item_fetch_failed", { run: run.id, ...errorFields(e) });
      throw new ItemFailure(/too large/i.test(e instanceof Error ? e.message : "") ? "The PDF is larger than 25 MB, which Billfold does not handle." : "Could not download this email from the mailbox.");
    }

    const bytes = await this.pdfBytes(orgId, source, item, fetched);
    const text = await this.pdf.extractText(bytes);
    const extracted = await this.extractor.extract({ pdfBytes: bytes, text, hints: { sourceName: source.name, periodKey: run.periodKey, currencyCode: DEFAULT_CURRENCY } });

    const fileName = `${run.periodKey} ${source.name} - ${item.attachmentName ?? (item.subject || "email")}`.replace(/(\.pdf)?$/i, ".pdf");
    let stored;
    try {
      stored = await this.drive.upload({
        secretJson: await this.secrets.decrypt(orgId, driveCipher), folderPath: [run.driveFolder, run.periodKey, source.name],
        fileName, bytes, mimeType: "application/pdf",
      });
    } catch (e) {
      logEvent("run_item_upload_failed", { run: run.id, ...errorFields(e) });
      throw new ItemFailure("Could not save the PDF to Google Drive. Check the Drive connection and try again.");
    }

    const bill = await this.bills.record(orgId, {
      periodKey: run.periodKey, sourceId: source.id, sourceName: source.name, billerName: extracted.billerName ?? source.name,
      amountMinor: extracted.amountMinor, currency: DEFAULT_CURRENCY, billDate: extracted.billDate, dueDate: extracted.dueDate,
      confidence: extracted.confidence, method: extracted.method, needsReview: needsReview(extracted), note: extracted.note,
      messageKey: item.itemKey, createdBy: actorId,
    }, {
      driveConnectionId: drive.id, driveAccount: drive.accountEmail, driveFileId: stored.fileId, driveFolderId: stored.folderId, webViewLink: stored.webViewLink,
      name: fileName, mimeType: "application/pdf", sizeBytes: bytes.byteLength, sha256: sha256Hex(bytes),
    });
    await this.audit.record({ orgId, actorUserId: actorId, action: "bill.filed", entityType: "bill", entityId: bill.id, metadata: { run: run.id, source: source.name, period: run.periodKey, needsReview: bill.needsReview } });
    return bill;
  }

  /** The PDF to file: the attachment with its password removed, or a PDF built from the email text. */
  private async pdfBytes(orgId: string, source: SourceRecord, item: RunItemRecord, fetched: Awaited<ReturnType<MailFetch["fetch"]>>): Promise<Uint8Array> {
    if (!fetched.attachment) {
      return this.pdf.textToPdf({
        title: item.subject || source.name,
        lines: [`From: ${fetched.from}`, `Date: ${fetched.date.toISOString().slice(0, 10)}`, "", ...fetched.bodyText.split("\n")],
      });
    }
    const password = await this.passwordFor(orgId, source, fetched.subject);
    const out = await this.pdf.unlock(fetched.attachment.bytes, password);
    if (out.status === "open") return out.bytes;
    if (out.status === "needs_password") throw new ItemFailure("This PDF is locked, but the source has no password for it. Edit the source's PDF setting.");
    if (out.status === "wrong_password") throw new ItemFailure("The password did not open this PDF. Check the source's PDF setting.");
    throw new ItemFailure("This file is not a readable PDF.");
  }

  private async passwordFor(orgId: string, source: SourceRecord, subject: string): Promise<string | null> {
    if (source.passwordMode === "static") {
      const cipher = await this.sources.findPasswordCiphertext(orgId, source.id);
      return cipher ? this.secrets.decrypt(orgId, cipher) : null;
    }
    return extractSubjectPassword(source.passwordMode, source.passwordPattern, subject);
  }
}
