import { DEFAULT_CURRENCY, ORG_UTC_OFFSET_MINUTES } from "@/constants/app";
import { DomainError } from "@/domain/errors/domain-error";
import type { AuditLogRepository, BillRepository, ConnectionRepository } from "@/domain/ports/repositories";
import type { BillFilter, BillPatch, BillRecord, NewBillFile } from "@/domain/ports/records";
import type { Clock, DriveStore, SecretBox } from "@/domain/ports/services";
import { isIsoDay } from "@/domain/value-objects/bill-data";
import { hasFullDriveAccess } from "@/domain/value-objects/connection";
import { sniffBillFile } from "@/domain/value-objects/upload";
import { BILL_UPLOAD_MAX_BYTES } from "@/constants/bills";
import { sha256Hex } from "@/lib/hash";
import { errorFields, logEvent } from "@/lib/log";
import { cleanName, folderTemplateProblem, renderFolderPath } from "@/lib/name-template";
import { INR } from "@/domain/value-objects/currency";
import { Money } from "@/domain/value-objects/money";
import { isPeriodKey, periodKeyFor } from "@/domain/value-objects/period";
import type { AuthorizationService } from "./authorization";

export interface BillFields {
  billerName: string;
  /** What the person typed, e.g. "1,234.50". Empty means "not known yet". */
  amountText: string;
  periodKey: string;
  billDate: string;
  dueDate: string;
  note: string;
}

interface Clean { billerName: string; amountMinor: bigint | null; periodKey: string; billDate: string | null; dueDate: string | null; note: string | null }

/** Checks what a person typed and turns it into stored values, with messages they can act on. */
export function cleanBillFields(input: BillFields, now: Date): Clean {
  const billerName = input.billerName.trim();
  if (billerName.length < 1 || billerName.length > 80) throw new DomainError("validation", "Biller name must be 1 to 80 characters.");
  let amountMinor: bigint | null = null;
  if (input.amountText.trim()) {
    const money = Money.parse(input.amountText.replace(/^₹/, ""), INR);
    if (!money) throw new DomainError("validation", "Enter the amount as a number, for example 1234.50.");
    if (!money.isPositive()) throw new DomainError("validation", "The amount must be more than zero.");
    if (money.minor > 99_999_999_999n) throw new DomainError("validation", "That amount is too large.");
    amountMinor = money.minor;
  }
  if (!isPeriodKey(input.periodKey)) throw new DomainError("validation", "Choose the month this bill belongs to.");
  if (input.periodKey > periodKeyFor(now, ORG_UTC_OFFSET_MINUTES)) throw new DomainError("validation", "A bill cannot belong to a month that has not started.");
  if (input.periodKey < "2000-01") throw new DomainError("validation", "Choose a more recent month.");
  const day = (value: string, label: string) => {
    const v = value.trim();
    if (!v) return null;
    if (!isIsoDay(v)) throw new DomainError("validation", `${label} is not a real date.`);
    return v;
  };
  const note = input.note.trim();
  if (note.length > 300) throw new DomainError("validation", "The note can be at most 300 characters.");
  return { billerName, amountMinor, periodKey: input.periodKey, billDate: day(input.billDate, "The bill date"), dueDate: day(input.dueDate, "The due date"), note: note || null };
}

/** Corrects a bill and, if asked, marks it as checked by a person. Deleted bills must be restored first. */
export class UpdateBill {
  constructor(
    private readonly bills: BillRepository,
    private readonly authz: AuthorizationService,
    private readonly clock: Clock,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: { actorId: string; orgId: string; billId: string; fields: BillFields; markChecked: boolean }): Promise<BillRecord> {
    await this.authz.require(input.actorId, input.orgId, "bills.edit");
    const bill = await this.bills.find(input.orgId, input.billId);
    if (!bill) throw new DomainError("not_found", "Bill not found");
    if (bill.deletedAt) throw new DomainError("validation", "This bill is deleted. Restore it before changing it.");
    const now = this.clock.now();
    const clean = cleanBillFields(input.fields, now);
    const patch: BillPatch = { ...clean };
    if (input.markChecked) Object.assign(patch, { needsReview: false, reviewedAt: now, reviewedBy: input.actorId });
    const updated = await this.bills.update(input.orgId, bill.id, patch);
    if (!updated) throw new DomainError("not_found", "Bill not found");
    const changed = (["billerName", "amountMinor", "periodKey", "billDate", "dueDate", "note"] as const).filter((k) => String(bill[k] ?? "") !== String(clean[k] ?? ""));
    await this.audit.record({
      orgId: input.orgId, actorUserId: input.actorId, action: "bill.updated", entityType: "bill", entityId: bill.id,
      metadata: { changed, checked: input.markChecked, biller: clean.billerName, period: clean.periodKey },
    });
    return updated;
  }
}

/** "I looked at it and it is right": clears the review flag without changing anything. */
export class MarkBillChecked {
  constructor(
    private readonly bills: BillRepository,
    private readonly authz: AuthorizationService,
    private readonly clock: Clock,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: { actorId: string; orgId: string; billId: string }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "bills.edit");
    const bill = await this.bills.find(input.orgId, input.billId);
    if (!bill) throw new DomainError("not_found", "Bill not found");
    if (bill.deletedAt) throw new DomainError("validation", "This bill is deleted. Restore it first.");
    await this.bills.update(input.orgId, bill.id, { needsReview: false, reviewedAt: this.clock.now(), reviewedBy: input.actorId });
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "bill.checked", entityType: "bill", entityId: bill.id, metadata: { biller: bill.billerName, period: bill.periodKey } });
  }
}

/** A bill with no email behind it: a cash payment, a paper bill, something the mailbox never saw. */
/** A file attached to a bill typed in by hand, and where in Google Drive it goes. */
export interface BillUpload {
  driveConnectionId: string;
  /** Folders from the top of Drive, e.g. "bills/{{Mon}}{{yy}}" (the bill's month fills the placeholders). */
  folderTemplate: string;
  file: { name: string; bytes: Uint8Array };
}

/** What a hand-typed bill needs to also file a document: the Drive connection, its sealed secret and the Drive itself. */
export interface BillFileDeps {
  connections: ConnectionRepository;
  secrets: SecretBox;
  drive: DriveStore;
}

export class CreateManualBill {
  constructor(
    private readonly bills: BillRepository,
    private readonly authz: AuthorizationService,
    private readonly clock: Clock,
    private readonly audit: AuditLogRepository,
    private readonly files?: BillFileDeps,
  ) {}

  async execute(input: { actorId: string; orgId: string; fields: BillFields; upload?: BillUpload }): Promise<BillRecord> {
    await this.authz.require(input.actorId, input.orgId, "bills.edit");
    const now = this.clock.now();
    const clean = cleanBillFields(input.fields, now);
    if (clean.amountMinor === null) throw new DomainError("validation", "Enter the amount.");
    const filed = input.upload ? await this.fileDocument(input.orgId, clean.periodKey, input.upload) : null;
    const bill = await this.bills.createManual(input.orgId, {
      ...clean, sourceId: null, sourceName: "Added by hand", currency: DEFAULT_CURRENCY, confidence: "high", method: "manual",
      needsReview: false, messageKey: `manual:${crypto.randomUUID()}`, createdBy: input.actorId,
    }, filed ?? undefined);
    await this.bills.update(input.orgId, bill.id, { reviewedAt: now, reviewedBy: input.actorId });
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "bill.created_manually", entityType: "bill", entityId: bill.id, metadata: { biller: clean.billerName, period: clean.periodKey, withFile: filed !== null } });
    return bill;
  }

  /** Checks the file and the folder, puts the file in Drive under the name it was uploaded with, and returns what to record about it. */
  private async fileDocument(orgId: string, periodKey: string, upload: BillUpload): Promise<NewBillFile> {
    if (!this.files) throw new DomainError("validation", "Attaching a file is not available.");
    const { file } = upload;
    if (file.bytes.byteLength === 0) throw new DomainError("validation", "That file is empty.");
    if (file.bytes.byteLength > BILL_UPLOAD_MAX_BYTES) throw new DomainError("validation", `The file is larger than ${BILL_UPLOAD_MAX_BYTES / 1048576} MB. Shrink it or file it in Drive by hand.`);
    const kind = sniffBillFile(file.bytes);
    if (!kind) throw new DomainError("validation", "Only PDF files and pictures (PNG, JPG or WebP) can be attached.");
    const template = upload.folderTemplate.trim();
    if (!template) throw new DomainError("validation", "Enter the folder to save the file in, for example bills/{{Mon}}{{yy}}.");
    const problem = folderTemplateProblem(template);
    if (problem) throw new DomainError("validation", problem);
    const drive = await this.files.connections.find(orgId, upload.driveConnectionId);
    const cipher = drive && drive.kind === "google_drive" ? await this.files.connections.findSecret(orgId, drive.id) : null;
    if (!drive || !cipher) throw new DomainError("validation", "Choose the Google Drive to save the file in.");
    if (!hasFullDriveAccess(drive.config)) throw new DomainError("validation", "This Google Drive needs more permission to use your own folders. Open Connections, press Reconnect on it and allow access, then try again.");

    // The name stays as it was uploaded (cleaned of characters Drive dislikes); the right extension is added only when it is missing.
    const cleaned = cleanName(file.name) || "bill";
    const fileName = cleaned.toLowerCase().endsWith(kind.extension) || (kind.extension === ".jpg" && /\.jpe?g$/i.test(cleaned)) ? cleaned : `${cleaned}${kind.extension}`;
    const folderPath = renderFolderPath(template, { periodKey, sourceName: "Added by hand" });
    if (folderPath.length === 0) throw new DomainError("validation", "The folder path came out empty.");
    let stored;
    try {
      stored = await this.files.drive.upload({ secretJson: await this.files.secrets.decrypt(orgId, cipher), folderPath, fileName, bytes: file.bytes, mimeType: kind.mimeType, avoidDuplicate: true });
    } catch (e) {
      logEvent("manual_bill_upload_failed", errorFields(e));
      throw new DomainError("validation", "Could not save the file to Google Drive. Check the Drive connection and try again. The bill was not added.");
    }
    return {
      driveConnectionId: drive.id, driveAccount: drive.accountEmail, driveFileId: stored.fileId, driveFolderId: stored.folderId, webViewLink: stored.webViewLink,
      name: stored.name, mimeType: kind.mimeType, sizeBytes: file.bytes.byteLength, sha256: sha256Hex(file.bytes),
    };
  }
}

export class SetBillPaid {
  constructor(
    private readonly bills: BillRepository,
    private readonly authz: AuthorizationService,
    private readonly clock: Clock,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: { actorId: string; orgId: string; billId: string; paid: boolean }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "bills.edit");
    const bill = await this.bills.find(input.orgId, input.billId);
    if (!bill) throw new DomainError("not_found", "Bill not found");
    if (bill.deletedAt) throw new DomainError("validation", "This bill is deleted. Restore it first.");
    await this.bills.update(input.orgId, bill.id, { paidAt: input.paid ? this.clock.now() : null });
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: input.paid ? "bill.marked_paid" : "bill.marked_unpaid", entityType: "bill", entityId: bill.id });
  }
}

/** Hides a bill from lists and reports. The row stays, so the next run does not file the same email again, and it can be restored. */
export class SetBillDeleted {
  constructor(
    private readonly bills: BillRepository,
    private readonly authz: AuthorizationService,
    private readonly clock: Clock,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: { actorId: string; orgId: string; billId: string; deleted: boolean }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "bills.edit");
    const bill = await this.bills.find(input.orgId, input.billId);
    if (!bill) throw new DomainError("not_found", "Bill not found");
    await this.bills.update(input.orgId, bill.id, input.deleted ? { deletedAt: this.clock.now(), deletedBy: input.actorId } : { deletedAt: null, deletedBy: null });
    await this.audit.record({
      orgId: input.orgId, actorUserId: input.actorId, action: input.deleted ? "bill.deleted" : "bill.restored", entityType: "bill", entityId: bill.id,
      metadata: { biller: bill.billerName, period: bill.periodKey },
    });
  }
}

/** Any member may read bills. */
export class ListBills {
  constructor(private readonly bills: BillRepository) {}
  list(orgId: string, filter: BillFilter): Promise<BillRecord[]> { return this.bills.list(orgId, filter); }
  find(orgId: string, id: string): Promise<BillRecord | null> { return this.bills.find(orgId, id); }
  summary(orgId: string) { return this.bills.summary(orgId); }
}
