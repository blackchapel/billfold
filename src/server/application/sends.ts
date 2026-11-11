import { DomainError } from "@/domain/errors/domain-error";
import type { AuditLogRepository, BillRepository, ConnectionRepository, RecipientRepository, SendItemRepository, SendRepository, UserRepository } from "@/domain/ports/repositories";
import type { SendCounts, SendItemRecord, SendRecord, SendStatus, SendSummary } from "@/domain/ports/records";
import type { Clock, DriveStore, MailSender, RateLimiter, SecretBox } from "@/domain/ports/services";
import { SEND_LIMITS } from "@/domain/value-objects/email-template";
import { errorFields, logEvent } from "@/lib/log";
import type { AuthorizationService } from "./authorization";
import type { Composed, SendComposer } from "./send-composer";

export const MAX_SEND_ATTEMPTS = 3;
export const SENDS_PER_HOUR = 10;
const STALE_AFTER_MS = 5 * 60_000;

export interface SendOptions { periodKey: string; templateId: string | null; attachPdfs: boolean; /** The account chosen to send from; fills {{from_name}} in the preview. */ connectionId?: string | null }

/** What the Send screen shows before anything leaves: the finished email, what is attached, and anything worth a second look. */
export class PreviewSend {
  constructor(private readonly composer: SendComposer, private readonly authz: AuthorizationService) {}

  async execute(input: { actorId: string; orgId: string } & SendOptions): Promise<Composed> {
    await this.authz.require(input.actorId, input.orgId, "reports.send");
    return this.composer.compose(input);
  }
}

export interface StartSendInput extends SendOptions {
  actorId: string;
  orgId: string;
  connectionId: string;
  recipientIds: string[];
  /** Send only to the person pressing the button, marked as a test. */
  test: boolean;
}

export class StartSend {
  constructor(
    private readonly composer: SendComposer,
    private readonly sends: SendRepository,
    private readonly items: SendItemRepository,
    private readonly recipients: RecipientRepository,
    private readonly connections: ConnectionRepository,
    private readonly users: UserRepository,
    private readonly authz: AuthorizationService,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: StartSendInput): Promise<SendRecord> {
    await this.authz.require(input.actorId, input.orgId, "reports.send");
    const connection = await this.connections.find(input.orgId, input.connectionId);
    if (!connection || (connection.kind !== "gmail" && connection.kind !== "smtp")) throw new DomainError("validation", "Choose a Gmail or SMTP connection to send from.");
    if (connection.status === "needs_attention") throw new DomainError("validation", "That connection needs to be reconnected before it can send.");

    let targets: { name: string; email: string }[];
    if (input.test) {
      const me = await this.users.findById(input.actorId);
      if (!me) throw new DomainError("not_found", "User not found");
      targets = [{ name: me.name?.trim() || me.email, email: me.email }];
    } else {
      const ids = [...new Set(input.recipientIds)];
      if (ids.length === 0) throw new DomainError("validation", "Choose at least one recipient.");
      if (ids.length > SEND_LIMITS.maxRecipients) throw new DomainError("validation", `Choose at most ${SEND_LIMITS.maxRecipients} recipients at a time.`);
      const found = await this.recipients.findMany(input.orgId, ids);
      if (found.length !== ids.length) throw new DomainError("validation", "One of the chosen recipients no longer exists. Reload and choose again.");
      targets = found.map((r) => ({ name: r.name, email: r.email }));
    }

    const composed = await this.composer.compose(input);
    if (!(await this.limiter.allow(`send:${input.orgId}:${input.actorId}`, SENDS_PER_HOUR, 3600))) {
      throw new DomainError("rate_limited", `You can start ${SENDS_PER_HOUR} sends an hour. Try again later.`);
    }
    const subject = input.test ? `[Test] ${composed.email.subject}` : composed.email.subject;
    const send = await this.sends.create(input.orgId, {
      periodKey: input.periodKey, templateName: composed.templateName, subject,
      bodyHtml: composed.email.html, bodyText: composed.email.text,
      fromConnectionId: connection.id, fromAccount: connection.accountEmail,
      attachmentFileIds: composed.files.map((f) => f.id), attachmentBytes: composed.attachmentBytes,
      billCount: composed.billCount, totalMinor: composed.totalMinor, isTest: input.test, createdBy: input.actorId,
    });
    await this.items.insertMany(input.orgId, send.id, targets.map((t) => ({ recipientName: t.name, recipientEmail: t.email })));
    await this.audit.record({
      orgId: input.orgId, actorUserId: input.actorId, action: input.test ? "send.test_started" : "send.started", entityType: "send", entityId: send.id,
      metadata: { period: input.periodKey, recipients: targets.length, attachments: composed.files.length },
    });
    return send;
  }
}

export function finishedSendStatus(counts: SendCounts): SendStatus | null {
  if (counts.pending > 0 || counts.processing > 0) return null;
  if (counts.sent === 0 && counts.failed > 0) return "failed";
  return counts.failed > 0 ? "sent_with_errors" : "sent";
}

export interface SendStepResult { send: SendRecord; counts: SendCounts; item: SendItemRecord | null; finished: boolean }

/** Sends the next waiting email: fetch the PDFs from Drive, hand the message to Gmail/SMTP. One recipient per call. */
export class ProcessNextSendItem {
  constructor(
    private readonly sends: SendRepository,
    private readonly items: SendItemRepository,
    private readonly bills: BillRepository,
    private readonly connections: ConnectionRepository,
    private readonly users: UserRepository,
    private readonly authz: AuthorizationService,
    private readonly secrets: SecretBox,
    private readonly drive: DriveStore,
    private readonly mailer: MailSender,
    private readonly clock: Clock,
  ) {}

  async execute(input: { actorId: string; orgId: string; sendId: string }): Promise<SendStepResult> {
    await this.authz.require(input.actorId, input.orgId, "reports.send");
    let send = await this.sends.find(input.orgId, input.sendId);
    if (!send) throw new DomainError("not_found", "Send not found");
    if (send.status === "cancelled") return this.result(send, null);

    const claimed = await this.items.claimNext(input.orgId, send.id, new Date(this.clock.now().getTime() - STALE_AFTER_MS));
    if (!claimed) return this.result((await this.finalise(send)) ?? send, null);
    try {
      await this.deliver(send, claimed);
      await this.items.markSent(input.orgId, claimed.id, this.clock.now());
    } catch (e) {
      const message = e instanceof DomainError ? e.message : "The email could not be sent. Try again.";
      if (!(e instanceof DomainError)) logEvent("send_item_failed", { send: send.id, item: claimed.id, ...errorFields(e) });
      await this.items.markFailed(input.orgId, claimed.id, message);
    }
    send = (await this.finalise(send)) ?? send;
    return this.result(send, await this.items.find(input.orgId, claimed.id));
  }

  private async deliver(send: SendRecord, item: SendItemRecord): Promise<void> {
    const orgId = send.orgId;
    if (!send.fromConnectionId) throw new DomainError("validation", "The connection this was to be sent from has been removed.");
    const connection = await this.connections.find(orgId, send.fromConnectionId);
    const cipher = connection ? await this.connections.findSecret(orgId, connection.id) : null;
    if (!connection || !cipher || (connection.kind !== "gmail" && connection.kind !== "smtp")) throw new DomainError("validation", "The connection this was to be sent from is no longer available.");
    const sender = await this.users.findById(send.createdBy);

    const files = send.attachmentFileIds.length > 0 ? await this.bills.findFiles(orgId, send.attachmentFileIds) : [];
    if (files.length !== send.attachmentFileIds.length) throw new DomainError("validation", "A PDF that was to be attached is no longer in Billfold. Prepare the send again.");
    const attachments: { filename: string; bytes: Uint8Array; contentType: string }[] = [];
    let total = 0;
    for (const f of files) {
      const driveCipher = f.driveConnectionId ? await this.connections.findSecret(orgId, f.driveConnectionId) : null;
      if (!driveCipher) throw new DomainError("validation", `The Google Drive connection holding ${f.name} is gone, so it cannot be attached.`);
      const bytes = await this.drive.download({ secretJson: await this.secrets.decrypt(orgId, driveCipher), fileId: f.driveFileId, maxBytes: SEND_LIMITS.maxAttachmentBytes });
      total += bytes.byteLength;
      if (total > SEND_LIMITS.maxAttachmentBytes) throw new DomainError("validation", "The PDFs are too large to attach to one email.");
      attachments.push({ filename: f.name, bytes, contentType: f.mimeType || "application/pdf" });
    }
    await this.mailer.send({
      kind: connection.kind, config: connection.config, secretJson: await this.secrets.decrypt(orgId, cipher),
      from: connection.accountEmail, fromName: sender?.name?.trim() || connection.accountEmail,
      to: { name: item.recipientName, email: item.recipientEmail },
      subject: send.subject, text: send.bodyText, html: send.bodyHtml, attachments,
    });
  }

  private async finalise(send: SendRecord): Promise<SendRecord | null> {
    const counts = (await this.sends.counts(send.orgId, [send.id])).get(send.id);
    const status = counts ? finishedSendStatus(counts) : null;
    if (!status) return null;
    if (send.status === status) return send;
    const now = this.clock.now();
    await this.sends.setStatus(send.orgId, send.id, status, now);
    return { ...send, status, finishedAt: now };
  }

  private async result(send: SendRecord, item: SendItemRecord | null): Promise<SendStepResult> {
    const counts = (await this.sends.counts(send.orgId, [send.id])).get(send.id) ?? { pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 };
    return { send, counts, item, finished: send.status !== "sending" || (counts.pending === 0 && counts.processing === 0) };
  }
}

export class CancelSend {
  constructor(private readonly sends: SendRepository, private readonly items: SendItemRepository, private readonly authz: AuthorizationService, private readonly clock: Clock, private readonly audit: AuditLogRepository) {}

  async execute(input: { actorId: string; orgId: string; sendId: string }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "reports.send");
    const send = await this.sends.find(input.orgId, input.sendId);
    if (!send) throw new DomainError("not_found", "Send not found");
    if (send.status !== "sending") throw new DomainError("validation", "This send has already finished.");
    const skipped = await this.items.skipPending(input.orgId, send.id, "Cancelled before this was sent.");
    await this.sends.setStatus(input.orgId, send.id, "cancelled", this.clock.now());
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "send.cancelled", entityType: "send", entityId: send.id, metadata: { skipped } });
  }
}

export class RetrySendItems {
  constructor(private readonly sends: SendRepository, private readonly items: SendItemRepository, private readonly authz: AuthorizationService, private readonly audit: AuditLogRepository) {}

  async execute(input: { actorId: string; orgId: string; sendId: string; itemId: string | null }): Promise<number> {
    await this.authz.require(input.actorId, input.orgId, "reports.send");
    const send = await this.sends.find(input.orgId, input.sendId);
    if (!send) throw new DomainError("not_found", "Send not found");
    if (send.status === "cancelled") throw new DomainError("validation", "This send was cancelled. Start a new one instead.");
    const n = await this.items.retryFailed(input.orgId, send.id, MAX_SEND_ATTEMPTS, input.itemId);
    if (n === 0) throw new DomainError("validation", `Nothing to retry. An email that failed ${MAX_SEND_ATTEMPTS} times needs the connection or address fixed first.`);
    if (send.status !== "sending") await this.sends.setStatus(input.orgId, send.id, "sending", null);
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "send.retried", entityType: "send", entityId: send.id, metadata: { items: n } });
    return n;
  }
}

export interface SendDetail { send: SendRecord; items: SendItemRecord[]; counts: SendCounts }

export class ReadSends {
  constructor(private readonly sends: SendRepository, private readonly items: SendItemRepository) {}

  async list(orgId: string, limit = 30): Promise<{ send: SendSummary; counts: SendCounts }[]> {
    const rows = await this.sends.list(orgId, limit);
    const counts = await this.sends.counts(orgId, rows.map((r) => r.id));
    return rows.map((send) => ({ send, counts: counts.get(send.id) ?? { pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 } }));
  }

  /** The latest sends without their delivery counts, for screens that only need to know what exists. */
  recent(orgId: string, limit = 20): Promise<SendSummary[]> { return this.sends.list(orgId, limit); }

  async get(orgId: string, id: string): Promise<SendDetail | null> {
    const send = await this.sends.find(orgId, id);
    if (!send) return null;
    const items = await this.items.list(orgId, id);
    const counts = (await this.sends.counts(orgId, [id])).get(id) ?? { pending: 0, processing: 0, sent: 0, failed: 0, skipped: 0 };
    return { send, items, counts };
  }
}
