import { PDFDocument } from "@cantoo/pdf-lib";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors/domain-error";
import type { FetchedMessage } from "@/domain/ports/services";
import type { MessageSummary } from "@/domain/value-objects/source-rules";
import { AuthorizationService } from "@/server/application/authorization";
import { AddMailAccount } from "@/server/application/connections";
import { CompleteGoogleConnect } from "@/server/application/google-connect";
import { CreateOrg } from "@/server/application/create-org";
import { SaveRunConfig } from "@/server/application/run-configs";
import { ProcessNextItem } from "@/server/application/run-processor";
import { CancelRun, ListRuns, RetryRunItems, StartRun } from "@/server/application/runs";
import { SaveSource, type SourceInput } from "@/server/application/sources";
import { PdfLibTools } from "@/server/infra/providers/pdf-tools";
import { TextBillExtractor } from "@/server/infra/providers/text-bill-extractor";
import { sha256Hex } from "@/lib/hash";
import { Memory } from "../../fakes/memory";

const pdfFile = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/pdf/${name}.pdf`));
const pdfTools = new PdfLibTools();

let m: Memory;
const authz = () => new AuthorizationService(m.orgRepo, m.memberRepo);
const expectCode = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toBeInstanceOf(DomainError);
  await p.catch((e: DomainError) => expect(e.code).toBe(code));
};
beforeEach(() => { m = new Memory(); });

const message = (over: Partial<MessageSummary> & { id: string }): MessageSummary => ({
  from: "Jio Billing <billing@jio.com>", subject: "Your Jio bill (abc123)", date: new Date("2026-10-20T10:00:00Z"), attachments: [{ name: "bill.pdf", size: 100 }], ...over,
});
const email = (over: Partial<FetchedMessage> = {}): FetchedMessage => ({
  subject: "Your Jio bill (abc123)", from: "Jio Billing <billing@jio.com>", date: new Date("2026-10-20T10:00:00Z"),
  attachment: { name: "bill.pdf", bytes: pdfFile("aes-256") }, bodyText: "", ...over,
});

async function world() {
  const owner = m.addUser("o@example.com");
  const viewer = m.addUser("v@example.com");
  const stranger = m.addUser("s@example.com");
  const org = await new CreateOrg(m.orgRepo, m.userRepo, m.auditRepo).execute({ userId: owner.id, name: "Home", defaultCurrency: "INR" });
  const other = await new CreateOrg(m.orgRepo, m.userRepo, m.auditRepo).execute({ userId: stranger.id, name: "Other", defaultCurrency: "INR" });
  await m.memberRepo.add(org.id, viewer.id, "viewer");
  const mailbox = await new AddMailAccount(m.connectionRepo, authz(), m.secretBox, m.probe, m.clock, m.auditRepo)
    .execute({ actorId: owner.id, orgId: org.id, kind: "imap", label: "Bills", host: "imap.example.com", port: 993, secure: true, username: "bills@example.com", password: "mail-pw" });
  const drive = await new CompleteGoogleConnect(m.connectionRepo, authz(), m.secretBox, m.google, m.probe, m.clock, m.auditRepo)
    .execute({ actorId: owner.id, orgId: org.id, kind: "google_drive", code: "c", redirectUri: "r" });
  const saveSource = new SaveSource(m.sourceRepo, m.connectionRepo, authz(), m.secretBox, m.auditRepo);
  const source = (over: Partial<SourceInput> = {}) => saveSource.execute({
    actorId: owner.id, orgId: org.id, name: "Jio", connectionId: mailbox.id, senders: ["jio.com"], subjectContains: null, attachmentNameContains: null,
    requireAttachment: true, passwordMode: "subject_brackets", passwordPattern: null, staticPassword: null, ...over,
  });
  const jio = await source();
  const config = (sourceIds: string[], name = "Monthly") => new SaveRunConfig(m.runConfigRepo, m.sourceRepo, m.connectionRepo, authz(), m.auditRepo)
    .execute({ actorId: owner.id, orgId: org.id, name, driveConnectionId: drive.id, driveFolder: "Billfold", periodMode: "previous_month", sourceIds });
  const runConfig = await config([jio.id]);
  const start = new StartRun(m.runRepo, m.runItemRepo, m.runConfigRepo, m.sourceRepo, m.connectionRepo, m.billRepo, authz(), m.secretBox, m.mailSearch, m.clock, m.auditRepo);
  const process = new ProcessNextItem(m.runRepo, m.runItemRepo, m.sourceRepo, m.connectionRepo, m.billRepo, authz(), m.secretBox, m.mailFetch, pdfTools, new TextBillExtractor(), m.driveStore, m.clock, m.auditRepo);
  const startRun = (actorId = owner.id, periodKey?: string) => start.execute({ actorId, orgId: org.id, runConfigId: runConfig.id, periodKey });
  const step = (runId: string, actorId = owner.id) => process.execute({ actorId, orgId: org.id, runId });
  const drain = async (runId: string) => { let last = await step(runId); for (let i = 0; i < 50 && !last.finished; i++) last = await step(runId); return last; };
  return { owner, viewer, stranger, org, other, mailbox, drive, jio, source, config, runConfig, start, process, startRun, step, drain };
}

describe("StartRun", () => {
  it("plans one pending item per matching PDF inside last month's window, with passwords masked", async () => {
    const w = await world();
    m.mailbox = [
      message({ id: "1" }),
      message({ id: "2", attachments: [{ name: "a.pdf", size: 1 }, { name: "b.PDF", size: 1 }], subject: "Two bills (zzz999)" }),
      message({ id: "3", attachments: [{ name: "photo.jpg", size: 1 }] }),
      message({ id: "4", from: "x@other.com" }),
    ];
    const { run, counts } = await w.startRun();
    expect(run).toMatchObject({ configName: "Monthly", periodKey: "2026-10", status: "processing", driveFolder: "Billfold", driveConnectionId: w.drive.id });
    expect(counts).toEqual({ pending: 3, processing: 0, done: 0, failed: 0, skipped: 1 });
    const call = m.searched.at(-1);
    expect(call?.since).toEqual(new Date("2026-09-30T18:30:00Z")); // 1 Oct, 00:00 in India
    expect(call?.before).toEqual(new Date("2026-10-31T18:30:00Z"));
    expect(call?.limit).toBe(200);
    const items = [...m.runItems.values()];
    expect(items.map((i) => i.subject)).toEqual(expect.arrayContaining(["Your Jio bill ([redacted])", "Two bills ([redacted])"]));
    expect(JSON.stringify(items)).not.toMatch(/abc123|zzz999/);
    expect(items.find((i) => i.status === "skipped")).toMatchObject({ error: "No PDF attachment in this email.", attachmentName: "photo.jpg" });
    expect(items.find((i) => i.attachmentName === "b.PDF")?.fromAddress).toBe("billing@jio.com");
  });

  it("turns a bill that is the email body into an item without an attachment, only for sources that allow it", async () => {
    const w = await world();
    const body = await w.source({ name: "Power", senders: ["power.example"], requireAttachment: false, passwordMode: "none" });
    await w.config([body.id], "Power run");
    m.mailbox = [message({ id: "9", from: "Power <a@power.example>", subject: "November bill", attachments: [] })];
    const rc = [...m.runConfigs.values()].find((c) => c.name === "Power run");
    const { counts } = await w.start.execute({ actorId: w.owner.id, orgId: w.org.id, runConfigId: rc?.id ?? "" });
    expect(counts.pending).toBe(1);
    expect([...m.runItems.values()][0]?.attachmentName).toBeNull();
  });

  it("skips emails already filed in an earlier run, and finishes at once when nothing is left to do", async () => {
    const w = await world();
    m.mailbox = [message({ id: "1" })];
    m.emails.set("1", email());
    const first = await w.startRun();
    await w.drain(first.run.id);
    expect(m.bills.size).toBe(1);
    const again = await w.startRun();
    expect(again.counts).toEqual({ pending: 0, processing: 0, done: 0, failed: 0, skipped: 1 });
    expect(again.run.status).toBe("completed");
    expect(again.run.finishedAt).not.toBeNull();
    expect([...m.runItems.values()].find((i) => i.runId === again.run.id)?.error).toBe("Already filed in an earlier run.");
  });

  it("shows an unreadable mailbox as a failed item instead of silently finding nothing", async () => {
    const w = await world();
    m.searchFails = true;
    const { counts, run } = await w.startRun();
    expect(counts).toMatchObject({ failed: 1, pending: 0 });
    expect(run.status).toBe("completed_with_errors");
    const item = [...m.runItems.values()][0];
    expect(item?.error).toMatch(/Could not read this source's mailbox/);
    expect(JSON.stringify(item)).not.toContain("hunter2"); // the provider's raw error is never kept
  });

  it("accepts any of the last 36 months, and nothing else", async () => {
    const w = await world();
    m.mailbox = [];
    expect((await w.startRun(w.owner.id, "2026-09")).run.periodKey).toBe("2026-09");
    expect(m.searched.at(-1)?.since).toEqual(new Date("2026-08-31T18:30:00Z"));
    expect((await w.startRun(w.owner.id, "2026-11")).run.periodKey).toBe("2026-11"); // this month is allowed
    for (const bad of ["2026-12", "2023-10", "2026-13", "nonsense", "2026-1"]) await expectCode(w.startRun(w.owner.id, bad), "validation");
    expect(StartRun.selectablePeriods(m.now)).toHaveLength(37);
    expect(StartRun.selectablePeriods(m.now)[0]).toBe("2026-11");
  });

  it("refuses when the Drive or every source is gone, and enforces permissions and org isolation", async () => {
    const w = await world();
    await expectCode(w.startRun(w.viewer.id), "forbidden");
    await expectCode(w.startRun(w.stranger.id), "not_found");
    await expectCode(w.start.execute({ actorId: w.stranger.id, orgId: w.other.id, runConfigId: w.runConfig.id }), "not_found");
    m.connections.delete(w.drive.id);
    await expect(w.startRun()).rejects.toThrow(/Google Drive/);
    m.connections.set(w.drive.id, { ...w.drive, secret: "x" });
    m.sources.clear();
    await expect(w.startRun()).rejects.toThrow(/no sources left/);
  });

  it("records the start in the audit log without any secret", async () => {
    const w = await world();
    m.mailbox = [message({ id: "1" })];
    await w.startRun();
    expect(m.audit.at(-1)).toMatchObject({ action: "run.started", metadata: { config: "Monthly", period: "2026-10", pending: 1 } });
    expect(JSON.stringify(m.audit)).not.toMatch(/abc123|mail-pw/);
  });
});

describe("ProcessNextItem", () => {
  it("files a locked PDF: opens it with the password from the subject, reads the amount, uploads the unlocked copy, saves the bill", async () => {
    const w = await world();
    m.mailbox = [message({ id: "1" })];
    m.emails.set("1", email());
    const { run } = await w.startRun();
    const out = await w.step(run.id);
    expect(out.item).toMatchObject({ status: "done", error: null, attempts: 1 });
    expect(out.finished).toBe(true);
    expect(out.run).toMatchObject({ status: "completed" });
    const bill = out.bill;
    expect(bill).toMatchObject({ amountMinor: 123450n, currency: "INR", confidence: "high", method: "text", needsReview: false, billerName: "Jio", periodKey: "2026-10", sourceName: "Jio" });
    expect(bill?.files[0]).toMatchObject({ driveFileId: "file-1", name: "2026-10 Jio - bill.pdf", mimeType: "application/pdf", driveAccount: "drive@example.com" });
    expect(m.uploads[0]).toMatchObject({ folderPath: ["Billfold", "2026-10", "Jio"], fileName: "2026-10 Jio - bill.pdf", mimeType: "application/pdf" });
    const uploaded = m.uploads[0]?.bytes ?? new Uint8Array();
    expect(await pdfTools.unlock(uploaded, null)).toMatchObject({ status: "open", wasLocked: false }); // what reached Drive has no password
    expect(await pdfTools.extractText(uploaded)).toContain("Total amount due: Rs 1,234.50");
    expect(bill?.files[0]?.sha256).toBe(sha256Hex(uploaded));
    expect(m.fetched[0]).toMatchObject({ kind: "imap", messageId: "1", attachmentName: "bill.pdf" });
    expect(JSON.stringify([...m.runItems.values(), ...m.bills.values(), m.audit], (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toMatch(/abc123|mail-pw/);
  });

  it("works through several items one call at a time and finishes the run when the last one is done", async () => {
    const w = await world();
    m.mailbox = [message({ id: "1" }), message({ id: "2", subject: "Another (abc123)" })];
    m.emails.set("1", email());
    m.emails.set("2", email({ subject: "Another (abc123)", attachment: { name: "bill.pdf", bytes: pdfFile("rc4-128") } }));
    const { run } = await w.startRun();
    const first = await w.step(run.id);
    expect(first).toMatchObject({ finished: false, run: { status: "processing" }, counts: { done: 1, pending: 1 } });
    const second = await w.step(run.id);
    expect(second).toMatchObject({ finished: true, run: { status: "completed" }, counts: { done: 2, pending: 0 } });
    expect(second.run.finishedAt).not.toBeNull();
    const nothing = await w.step(run.id);
    expect(nothing).toMatchObject({ item: null, finished: true });
  });

  it("uses a saved static password, and a wrong one fails that item with a clear message and files nothing", async () => {
    const w = await world();
    const bank = await w.source({ name: "Bank", senders: ["bank.example"], passwordMode: "static", staticPassword: "abc123" });
    const bad = await w.source({ name: "Bad bank", senders: ["bad.example"], passwordMode: "static", staticPassword: "nope-nope" });
    const rc = await w.config([bank.id, bad.id], "Banks");
    m.mailbox = [
      message({ id: "10", from: "Bank <a@bank.example>", subject: "Statement" }),
      message({ id: "11", from: "Bad <a@bad.example>", subject: "Statement" }),
    ];
    m.emails.set("10", email({ subject: "Statement", attachment: { name: "bill.pdf", bytes: pdfFile("aes-128") } }));
    m.emails.set("11", email({ subject: "Statement", attachment: { name: "bill.pdf", bytes: pdfFile("aes-128") } }));
    const { run } = await w.start.execute({ actorId: w.owner.id, orgId: w.org.id, runConfigId: rc.id });
    const last = await w.drain(run.id);
    expect(last.run.status).toBe("completed_with_errors");
    const items = [...m.runItems.values()];
    expect(items.find((i) => i.sourceName === "Bank")?.status).toBe("done");
    const failed = items.find((i) => i.sourceName === "Bad bank");
    expect(failed).toMatchObject({ status: "failed", error: "The password did not open this PDF. Check the source's PDF setting." });
    expect(m.bills.size).toBe(1);
    expect(m.uploads).toHaveLength(1);
    expect(JSON.stringify([...m.runItems.values()])).not.toMatch(/nope-nope|abc123/);
  });

  it("explains a locked PDF with no way to open it, and a file that is not a PDF", async () => {
    const w = await world();
    const plainSource = await w.source({ name: "Plain", senders: ["plain.example"], passwordMode: "none" });
    const rc = await w.config([plainSource.id], "Plain run");
    m.mailbox = [message({ id: "20", from: "P <a@plain.example>" }), message({ id: "21", from: "P <b@plain.example>" })];
    m.emails.set("20", email({ attachment: { name: "bill.pdf", bytes: pdfFile("aes-256") } }));
    m.emails.set("21", email({ attachment: { name: "bill.pdf", bytes: new TextEncoder().encode("<html>login page</html>") } }));
    const { run } = await w.start.execute({ actorId: w.owner.id, orgId: w.org.id, runConfigId: rc.id });
    await w.drain(run.id);
    const errors = [...m.runItems.values()].map((i) => i.error).sort();
    expect(errors).toEqual(["This PDF is locked, but the source has no password for it. Edit the source's PDF setting.", "This file is not a readable PDF."]);
  });

  it("builds a PDF from the email text when the bill is the email itself", async () => {
    const w = await world();
    const body = await w.source({ name: "Power", senders: ["power.example"], requireAttachment: false, passwordMode: "none" });
    const rc = await w.config([body.id], "Power run");
    m.mailbox = [message({ id: "30", from: "Power <a@power.example>", subject: "November bill", attachments: [] })];
    m.emails.set("30", email({ subject: "November bill", from: "Power <a@power.example>", attachment: null, bodyText: "Dear customer\nAmount payable: ₹ 2,310.00\nDue date: 20/12/2026" }));
    const { run } = await w.start.execute({ actorId: w.owner.id, orgId: w.org.id, runConfigId: rc.id });
    const out = await w.step(run.id);
    expect(out.bill).toMatchObject({ amountMinor: 231000n, dueDate: "2026-12-20", needsReview: false });
    expect(m.uploads[0]?.fileName).toBe("2026-10 Power - November bill.pdf");
    expect(await pdfTools.extractText(m.uploads[0]?.bytes ?? new Uint8Array())).toContain("Dear customer");
  });

  it("files a scan with no readable text but flags it for review with an explanation", async () => {
    const w = await world();
    const blank = await PDFDocument.create();
    blank.addPage();
    m.mailbox = [message({ id: "1" })];
    m.emails.set("1", email({ attachment: { name: "bill.pdf", bytes: await blank.save() } }));
    const { run } = await w.startRun();
    const out = await w.step(run.id);
    expect(out.item?.status).toBe("done");
    expect(out.bill).toMatchObject({ amountMinor: null, needsReview: true, confidence: "low" });
    expect(out.bill?.note).toMatch(/scan/);
  });

  it("fails an item without leaking provider errors, and the item can be retried to success", async () => {
    const w = await world();
    m.mailbox = [message({ id: "1" })];
    m.emails.set("1", new Error("IMAP said: LOGIN failed for bills@example.com password=mail-pw"));
    const { run } = await w.startRun();
    const failed = await w.step(run.id);
    expect(failed.item).toMatchObject({ status: "failed", error: "Could not download this email from the mailbox.", attempts: 1 });
    expect(JSON.stringify([...m.runItems.values()])).not.toContain("mail-pw");
    expect(failed.run.status).toBe("completed_with_errors");

    m.emails.set("1", email());
    m.uploadFails = true;
    const retry = new RetryRunItems(m.runRepo, m.runItemRepo, authz(), m.auditRepo);
    expect(await retry.execute({ actorId: w.owner.id, orgId: w.org.id, runId: run.id, itemId: null })).toBe(1);
    expect(m.runs.get(run.id)?.status).toBe("processing");
    const uploadFailed = await w.step(run.id);
    expect(uploadFailed.item).toMatchObject({ status: "failed", error: "Could not save the PDF to Google Drive. Check the Drive connection and try again.", attempts: 2 });
    expect(JSON.stringify([...m.runItems.values()])).not.toContain("SECRET-TOKEN");
    expect(m.bills.size).toBe(0);

    m.uploadFails = false;
    await retry.execute({ actorId: w.owner.id, orgId: w.org.id, runId: run.id, itemId: failed.item?.id ?? null });
    const ok = await w.step(run.id);
    expect(ok).toMatchObject({ item: { status: "done", attempts: 3 }, run: { status: "completed" } });
    expect(m.bills.size).toBe(1);
  });

  it("stops offering retries after five attempts", async () => {
    const w = await world();
    m.mailbox = [message({ id: "1" })];
    m.emails.set("1", new Error("down"));
    const { run } = await w.startRun();
    const retry = new RetryRunItems(m.runRepo, m.runItemRepo, authz(), m.auditRepo);
    for (let i = 0; i < 4; i++) { await w.step(run.id); await retry.execute({ actorId: w.owner.id, orgId: w.org.id, runId: run.id, itemId: null }); }
    await w.step(run.id);
    expect([...m.runItems.values()][0]?.attempts).toBe(5);
    await expect(retry.execute({ actorId: w.owner.id, orgId: w.org.id, runId: run.id, itemId: null })).rejects.toThrow(/failed 5 times/);
  });

  it("fails the item, not the run, when the source, mailbox or Drive disappears mid-run", async () => {
    const w = await world();
    m.mailbox = [message({ id: "1" }), message({ id: "2" }), message({ id: "3" })];
    for (const id of ["1", "2", "3"]) m.emails.set(id, email());
    const { run } = await w.startRun();
    m.sources.delete(w.jio.id);
    expect((await w.step(run.id)).item?.error).toBe("This source was deleted after the run started.");
    m.sources.set(w.jio.id, { ...w.jio, cipher: null, matcher: w.jio.matcher });
    m.connections.delete(w.mailbox.id);
    expect((await w.step(run.id)).item?.error).toBe("This source's mailbox is no longer connected.");
    m.connections.set(w.mailbox.id, { ...w.mailbox, secret: "x" });
    m.connections.delete(w.drive.id);
    expect((await w.step(run.id)).item?.error).toBe("The Google Drive for this run is no longer connected.");
  });

  it("hands out an item whose request died only after five minutes, never while it may still be running", async () => {
    const w = await world();
    m.mailbox = [message({ id: "1" })];
    m.emails.set("1", email());
    const { run } = await w.startRun();
    // Another request claims the item and then dies: the item stays "processing".
    await m.runItemRepo.claimNext(w.org.id, run.id, new Date(0));
    const tooSoon = await w.step(run.id);
    expect(tooSoon).toMatchObject({ item: null, finished: false, counts: { processing: 1 }, run: { status: "processing" } });
    m.now = new Date(m.now.getTime() + 4 * 60_000);
    expect((await w.step(run.id)).item).toBeNull();
    m.now = new Date(m.now.getTime() + 2 * 60_000);
    expect(await w.step(run.id)).toMatchObject({ item: { status: "done", attempts: 2 }, finished: true, run: { status: "completed" } });
  });

  it("does nothing for a cancelled run", async () => {
    const w = await world();
    m.mailbox = [message({ id: "1" })];
    m.emails.set("1", email());
    const { run } = await w.startRun();
    await new CancelRun(m.runRepo, m.runItemRepo, authz(), m.clock, m.auditRepo).execute({ actorId: w.owner.id, orgId: w.org.id, runId: run.id });
    expect(await w.step(run.id)).toMatchObject({ item: null, finished: true, run: { status: "cancelled" } });
    expect(m.fetched).toHaveLength(0);
  });

  it("enforces permissions and org isolation", async () => {
    const w = await world();
    m.mailbox = [message({ id: "1" })];
    m.emails.set("1", email());
    const { run } = await w.startRun();
    await expectCode(w.step(run.id, w.viewer.id), "forbidden");
    await expectCode(w.step(run.id, w.stranger.id), "not_found");
    await expectCode(w.process.execute({ actorId: w.stranger.id, orgId: w.other.id, runId: run.id }), "not_found");
    expect(m.bills.size).toBe(0);
  });
});

describe("CancelRun, RetryRunItems and ListRuns", () => {
  it("cancels a running run (pending items become skipped) but not a finished one", async () => {
    const w = await world();
    m.mailbox = [message({ id: "1" }), message({ id: "2" })];
    m.emails.set("1", email()); m.emails.set("2", email());
    const { run } = await w.startRun();
    await w.step(run.id);
    const cancel = new CancelRun(m.runRepo, m.runItemRepo, authz(), m.clock, m.auditRepo);
    await expectCode(cancel.execute({ actorId: w.viewer.id, orgId: w.org.id, runId: run.id }), "forbidden");
    await cancel.execute({ actorId: w.owner.id, orgId: w.org.id, runId: run.id });
    expect(m.runs.get(run.id)).toMatchObject({ status: "cancelled" });
    const states = [...m.runItems.values()].map((i) => i.status).sort();
    expect(states).toEqual(["done", "skipped"]);
    await expectCode(cancel.execute({ actorId: w.owner.id, orgId: w.org.id, runId: run.id }), "validation");
    await expect(new RetryRunItems(m.runRepo, m.runItemRepo, authz(), m.auditRepo).execute({ actorId: w.owner.id, orgId: w.org.id, runId: run.id, itemId: null })).rejects.toThrow(/cancelled/);
  });

  it("lists recent runs with counts, and returns a run's items with the bills they produced", async () => {
    const w = await world();
    m.mailbox = [message({ id: "1" })];
    m.emails.set("1", email());
    const { run } = await w.startRun();
    await w.drain(run.id);
    const list = new ListRuns(m.runRepo, m.runItemRepo, m.billRepo);
    expect(await list.recent(w.org.id)).toEqual([expect.objectContaining({ run: expect.objectContaining({ id: run.id }), counts: expect.objectContaining({ done: 1 }) })]);
    expect(await list.recent(w.other.id)).toEqual([]);
    const detail = await list.detail(w.org.id, run.id);
    expect(detail?.items).toHaveLength(1);
    const billId = detail?.items[0]?.billId ?? "";
    expect(detail?.bills.get(billId)?.amountMinor).toBe(123450n);
    expect(await list.detail(w.other.id, run.id)).toBeNull();
  });
});
