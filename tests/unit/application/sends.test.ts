import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors/domain-error";
import type { NewBill } from "@/domain/ports/records";
import { AuthorizationService } from "@/server/application/authorization";
import { AddMailAccount } from "@/server/application/connections";
import { CompleteGoogleConnect } from "@/server/application/google-connect";
import { CreateOrg } from "@/server/application/create-org";
import { DeleteTemplate, SaveTemplate, SetDefaultTemplate } from "@/server/application/email-templates";
import { DeleteRecipient, ListRecipients, SaveRecipient } from "@/server/application/recipients";
import { SetConnectionSenderName } from "@/server/application/connections";
import { SendComposer } from "@/server/application/send-composer";
import { CancelSend, PreviewSend, ProcessNextSendItem, ReadSends, RetrySendItems, StartSend } from "@/server/application/sends";
import { Memory } from "../../fakes/memory";

let m: Memory;
const authz = () => new AuthorizationService(m.orgRepo, m.memberRepo);
const expectCode = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toBeInstanceOf(DomainError);
  await p.catch((e: DomainError) => expect(e.code).toBe(code));
};
beforeEach(() => { m = new Memory(); });

const newBill = (over: Partial<NewBill> = {}): NewBill => ({
  periodKey: "2026-10", sourceId: "src-1", sourceName: "Jio", billerName: "Jio", amountMinor: 123_450n, currency: "INR", billDate: "2026-10-30", dueDate: "2026-11-15",
  confidence: "high", method: "text", needsReview: false, note: null, messageKey: `k-${Math.random()}`, createdBy: "u", ...over,
});

async function world() {
  const owner = m.addUser("o@example.com");
  const member = m.addUser("m@example.com");
  const viewer = m.addUser("v@example.com");
  const stranger = m.addUser("s@example.com");
  const org = await new CreateOrg(m.orgRepo, m.userRepo, m.auditRepo).execute({ userId: owner.id, name: "Home <b>", defaultCurrency: "INR" });
  const other = await new CreateOrg(m.orgRepo, m.userRepo, m.auditRepo).execute({ userId: stranger.id, name: "Other", defaultCurrency: "INR" });
  await m.memberRepo.add(org.id, member.id, "member");
  await m.memberRepo.add(org.id, viewer.id, "viewer");
  const drive = await new CompleteGoogleConnect(m.connectionRepo, authz(), m.secretBox, m.google, m.probe, m.clock, m.auditRepo)
    .execute({ actorId: owner.id, orgId: org.id, kind: "google_drive", code: "c", redirectUri: "r" });
  const smtp = await new AddMailAccount(m.connectionRepo, authz(), m.secretBox, m.probe, m.clock, m.auditRepo)
    .execute({ actorId: owner.id, orgId: org.id, kind: "smtp", label: "Send", host: "smtp.example.com", port: 465, secure: true, username: "send@example.com", password: "smtp-pw" });
  const file = (name: string, id: string) => ({ driveConnectionId: drive.id, driveAccount: "drive@example.com", driveFileId: id, driveFolderId: "fo", webViewLink: "https://drive.test/1", name, mimeType: "application/pdf", sizeBytes: 10, sha256: "ab" });
  await m.billRepo.record(org.id, newBill({ messageKey: "a" }), file("jio.pdf", "f1"));
  await m.billRepo.record(org.id, newBill({ billerName: "Power <script>", sourceName: "Power", amountMinor: 50_000n, messageKey: "b", needsReview: true }), file("power.pdf", "f2"));
  await m.billRepo.record(org.id, newBill({ periodKey: "2026-09", messageKey: "c" }), file("old.pdf", "f3"));
  const saveRecipient = new SaveRecipient(m.recipientRepo, authz(), m.auditRepo);
  const asha = await saveRecipient.execute({ actorId: owner.id, orgId: org.id, name: "Asha", email: "Asha@Example.com" });
  const ravi = await saveRecipient.execute({ actorId: owner.id, orgId: org.id, name: "Ravi", email: "ravi@example.com" });
  const composer = new SendComposer(m.billRepo, m.templateRepo, m.orgRepo, m.userRepo, m.connectionRepo);
  const start = new StartSend(composer, m.sendRepo, m.sendItemRepo, m.recipientRepo, m.connectionRepo, m.userRepo, authz(), m.limiter, m.auditRepo);
  const process = new ProcessNextSendItem(m.sendRepo, m.sendItemRepo, m.billRepo, m.connectionRepo, m.userRepo, authz(), m.secretBox, m.driveStore, m.mailSender, m.clock);
  const send = (over: Partial<Parameters<StartSend["execute"]>[0]> = {}) =>
    start.execute({ actorId: owner.id, orgId: org.id, periodKey: "2026-10", templateId: null, attachPdfs: true, connectionId: smtp.id, recipientIds: [asha.id, ravi.id], test: false, ...over });
  const step = (sendId: string, actorId = owner.id) => process.execute({ actorId, orgId: org.id, sendId });
  const drain = async (sendId: string) => { let last = await step(sendId); for (let i = 0; i < 20 && !last.finished; i++) last = await step(sendId); return last; };
  return { owner, member, viewer, stranger, org, other, drive, smtp, asha, ravi, composer, send, step, drain, saveRecipient };
}

describe("recipients", () => {
  it("stores addresses in lower case, refuses duplicates and bad input, and needs recipients.manage", async () => {
    const w = await world();
    expect(w.asha.email).toBe("asha@example.com");
    const save = (email: string, name = "X", actorId = w.owner.id) => w.saveRecipient.execute({ actorId, orgId: w.org.id, name, email });
    await expect(save("ASHA@example.com")).rejects.toThrow(/already in the list/);
    await expect(save("nope")).rejects.toThrow(/valid email/);
    await expect(save("a@example.com", "")).rejects.toThrow(/Name/);
    await expect(save("a@example.com", "Line\nBreak")).rejects.toThrow(/Name/);
    await expectCode(save("z@example.com", "Z", w.viewer.id), "forbidden");
    await expectCode(save("z@example.com", "Z", w.stranger.id), "not_found");
    const renamed = await w.saveRecipient.execute({ actorId: w.owner.id, orgId: w.org.id, id: w.asha.id, name: "Asha K", email: "asha@example.com" });
    expect(renamed.name).toBe("Asha K");
    expect(await new ListRecipients(m.recipientRepo).execute(w.org.id)).toHaveLength(2);
    expect(await new ListRecipients(m.recipientRepo).execute(w.other.id)).toHaveLength(0);
  });
  it("deletes a recipient without touching what was already sent", async () => {
    const w = await world();
    const s = await w.send();
    await new DeleteRecipient(m.recipientRepo, authz(), m.auditRepo).execute({ actorId: w.owner.id, orgId: w.org.id, recipientId: w.asha.id });
    expect((await m.sendItemRepo.list(w.org.id, s.id)).map((i) => i.recipientEmail)).toContain("asha@example.com");
    await expectCode(new DeleteRecipient(m.recipientRepo, authz(), m.auditRepo).execute({ actorId: w.owner.id, orgId: w.other.id, recipientId: w.ravi.id }), "not_found");
  });
});

describe("templates", () => {
  const tpl = { name: "Short", subject: "{{month}} bills", intro: "Hi", signoff: "Bye" };
  it("validates placeholders and names, keeps one default, and falls back to the built-in wording", async () => {
    const w = await world();
    const save = new SaveTemplate(m.templateRepo, authz(), m.auditRepo);
    await expect(save.execute({ actorId: w.owner.id, orgId: w.org.id, ...tpl, subject: "{{mnth}}" })).rejects.toThrow(/Unknown placeholder: \{\{mnth\}\}/);
    await expect(save.execute({ actorId: w.owner.id, orgId: w.org.id, ...tpl, name: "x" })).rejects.toThrow(/Name/);
    await expectCode(save.execute({ actorId: w.viewer.id, orgId: w.org.id, ...tpl }), "forbidden");
    const a = await save.execute({ actorId: w.owner.id, orgId: w.org.id, ...tpl });
    await expect(save.execute({ actorId: w.owner.id, orgId: w.org.id, ...tpl, name: "SHORT" })).rejects.toThrow(/already exists/);
    const b = await save.execute({ actorId: w.owner.id, orgId: w.org.id, ...tpl, name: "Long", subject: "Bills {{month}} {{total}}" });
    const setDefault = new SetDefaultTemplate(m.templateRepo, authz(), m.auditRepo);
    await setDefault.execute({ actorId: w.owner.id, orgId: w.org.id, templateId: a.id });
    await setDefault.execute({ actorId: w.owner.id, orgId: w.org.id, templateId: b.id });
    expect((await m.templateRepo.list(w.org.id)).filter((t) => t.isDefault).map((t) => t.name)).toEqual(["Long"]);
    expect((await w.composer.compose({ actorId: w.owner.id, orgId: w.org.id, periodKey: "2026-10", templateId: null, attachPdfs: true })).email.subject).toBe("Bills October 2026 ₹1,734.50");
    await new DeleteTemplate(m.templateRepo, authz(), m.auditRepo).execute({ actorId: w.owner.id, orgId: w.org.id, templateId: b.id });
    expect((await w.composer.compose({ actorId: w.owner.id, orgId: w.org.id, periodKey: "2026-10", templateId: null, attachPdfs: true })).templateName).toBe("Standard summary");
  });
});

describe("PreviewSend and the composed email", () => {
  it("shows the month's bills, escapes everything, attaches the PDFs and warns about unchecked bills", async () => {
    const w = await world();
    const out = await new PreviewSend(w.composer, authz()).execute({ actorId: w.owner.id, orgId: w.org.id, periodKey: "2026-10", templateId: null, attachPdfs: true });
    await expectCode(new PreviewSend(w.composer, authz()).execute({ actorId: w.member.id, orgId: w.org.id, periodKey: "2026-10", templateId: null, attachPdfs: true }), "forbidden");
    expect(out).toMatchObject({ billCount: 2, totalMinor: 173_450n, attachmentBytes: 20 });
    expect(out.files.map((f) => f.name).sort()).toEqual(["jio.pdf", "power.pdf"]);
    expect(out.email.subject).toBe("Bills for October 2026: ₹1,734.50 across 2 bills");
    expect(out.email.html).toContain("Power &lt;script&gt;");
    expect(out.email.html).toContain("Home &lt;b&gt;");
    expect(out.email.html).not.toContain("<script>");
    expect(out.warnings.join(" ")).toMatch(/1 bill still needs a check/);
  });
  it("fills {{from_name}} with the name set on the sending account, else with the sender", async () => {
    const w = await world();
    const setName = new SetConnectionSenderName(m.connectionRepo, authz(), m.auditRepo);
    const signed = await new SaveTemplate(m.templateRepo, authz(), m.auditRepo).execute({ actorId: w.owner.id, orgId: w.org.id, name: "Signed", subject: "Bills", intro: "Hi", signoff: "From {{from_name}} / {{sender}}" });
    const preview = (connectionId: string | null) => new PreviewSend(w.composer, authz()).execute({ actorId: w.owner.id, orgId: w.org.id, periodKey: "2026-10", templateId: signed.id, attachPdfs: false, connectionId });
    expect((await preview(w.smtp.id)).email.text).toContain("From o@example.com / o@example.com"); // nothing set: the person pressing Send
    await setName.execute({ actorId: w.owner.id, orgId: w.org.id, connectionId: w.smtp.id, name: "  Priya   Sharma " });
    expect((await preview(w.smtp.id)).email.text).toContain("From Priya Sharma / o@example.com");
    expect((await preview(null)).email.text).toContain("From o@example.com / o@example.com"); // no account chosen yet
    const out = await w.send({ templateId: signed.id, attachPdfs: false, test: true });
    expect((await m.sendRepo.find(w.org.id, out.id))?.bodyText).toContain("From Priya Sharma"); // what is stored is what goes out
    await setName.execute({ actorId: w.owner.id, orgId: w.org.id, connectionId: w.smtp.id, name: "" });
    expect((await preview(w.smtp.id)).email.text).toContain("From o@example.com / o@example.com");
  });
  it("shows the sending account's own name as the sender in the inbox, else the person pressing Send, else the address", async () => {
    const w = await world();
    const sendOne = async () => { m.outbox.length = 0; const s = await w.send({ attachPdfs: false, recipientIds: [w.asha.id] }); await w.drain(s.id); return m.outbox[0]?.fromName; };
    expect(await sendOne()).toBe("send@example.com"); // no name anywhere: the account address
    m.users.set(w.owner.id, { ...(m.users.get(w.owner.id) as NonNullable<ReturnType<typeof m.users.get>>), name: "Ravi Kumar" });
    expect(await sendOne()).toBe("Ravi Kumar"); // no account name: the person pressing Send
    const setName = new SetConnectionSenderName(m.connectionRepo, authz(), m.auditRepo);
    await setName.execute({ actorId: w.owner.id, orgId: w.org.id, connectionId: w.smtp.id, name: "Priya Sharma" });
    expect(await sendOne()).toBe("Priya Sharma"); // the account's name wins, whoever presses Send
  });
  it("only managers name an account, only mail-sending accounts have a name, and bad names are refused", async () => {
    const w = await world();
    const setName = new SetConnectionSenderName(m.connectionRepo, authz(), m.auditRepo);
    const base = { orgId: w.org.id, connectionId: w.smtp.id, name: "Priya" };
    await expectCode(setName.execute({ ...base, actorId: w.viewer.id }), "forbidden");
    await expectCode(setName.execute({ ...base, actorId: w.stranger.id }), "not_found");
    await expectCode(setName.execute({ ...base, actorId: w.owner.id, connectionId: w.drive.id }), "validation");
    await expectCode(setName.execute({ ...base, actorId: w.owner.id, name: "x".repeat(81) }), "validation");
    await expectCode(setName.execute({ ...base, actorId: w.owner.id, name: "<b>Priya</b>" }), "validation");
    await setName.execute({ ...base, actorId: w.owner.id });
    expect(m.audit.at(-1)).toMatchObject({ action: "connection.sender_name_set" });
    expect((await m.connectionRepo.find(w.org.id, w.smtp.id))?.config).toMatchObject({ senderName: "Priya", host: "smtp.example.com" }); // the rest of the settings stay
  });
  it("never puts a bill's internal note (such as the reader's fallback remark) in the email", async () => {
    const w = await world();
    for (const [id, b] of m.bills) m.bills.set(id, { ...b, note: "Gemini could not read this bill, so the built-in reader was used." });
    const out = await new PreviewSend(w.composer, authz()).execute({ actorId: w.owner.id, orgId: w.org.id, periodKey: "2026-10", templateId: null, attachPdfs: true });
    expect(out.email.html).toContain("Jio");
    expect(out.email.html + out.email.text).not.toMatch(/Gemini|built-in reader/);
  });
  it("leaves PDFs out when asked, or when they are too many or too big, and says so", async () => {
    const w = await world();
    expect((await w.composer.compose({ actorId: w.owner.id, orgId: w.org.id, periodKey: "2026-10", templateId: null, attachPdfs: false })).files).toHaveLength(0);
    for (const b of m.bills.values()) for (const f of b.files) f.sizeBytes = 10 * 1024 * 1024;
    const big = await w.composer.compose({ actorId: w.owner.id, orgId: w.org.id, periodKey: "2026-10", templateId: null, attachPdfs: true });
    expect(big.files).toHaveLength(0);
    expect(big.warnings.join(" ")).toMatch(/none are attached/);
  });
  it("refuses a month without bills and needs reports.send", async () => {
    const w = await world();
    await expect(w.composer.compose({ actorId: w.owner.id, orgId: w.org.id, periodKey: "2026-08", templateId: null, attachPdfs: true })).rejects.toThrow(/no bills for August 2026/);
    await expectCode(new PreviewSend(w.composer, authz()).execute({ actorId: w.viewer.id, orgId: w.org.id, periodKey: "2026-10", templateId: null, attachPdfs: true }), "forbidden");
  });
});

describe("StartSend and ProcessNextSendItem", () => {
  it("sends one email per recipient with the PDFs attached and stores exactly what went out", async () => {
    const w = await world();
    const s = await w.send();
    expect(s).toMatchObject({ status: "sending", billCount: 2, fromAccount: "send@example.com", isTest: false });
    const last = await w.drain(s.id);
    expect(last).toMatchObject({ finished: true, counts: { sent: 2, failed: 0 } });
    expect(last.send.status).toBe("sent");
    expect(m.outbox.map((e) => e.to.email).sort()).toEqual(["asha@example.com", "ravi@example.com"]);
    expect(m.outbox[0]).toMatchObject({ subject: s.subject, html: s.bodyHtml, kind: "smtp", secretJson: expect.stringContaining("smtp-pw") });
    expect(m.outbox[0]?.attachments.map((a) => a.filename).sort()).toEqual(["jio.pdf", "power.pdf"]);
    expect(m.audit.at(-1)).toMatchObject({ action: "send.started", metadata: { recipients: 2, attachments: 2 } });
  });
  it("a refused address fails only that email, hides provider details, and can be retried until the limit", async () => {
    const w = await world();
    m.refusedRecipients.add("ravi@example.com");
    const s = await w.send();
    const last = await w.drain(s.id);
    expect(last.send.status).toBe("sent_with_errors");
    const items = await m.sendItemRepo.list(w.org.id, s.id);
    const bad = items.find((i) => i.recipientEmail === "ravi@example.com");
    expect(bad).toMatchObject({ status: "failed", error: "The email could not be sent. Try again." });
    expect(JSON.stringify([...m.sendItems.values()])).not.toContain("SECRET-PW");
    const retry = new RetrySendItems(m.sendRepo, m.sendItemRepo, authz(), m.auditRepo);
    expect(await retry.execute({ actorId: w.owner.id, orgId: w.org.id, sendId: s.id, itemId: null })).toBe(1);
    expect((await m.sendRepo.find(w.org.id, s.id))?.status).toBe("sending");
    m.refusedRecipients.delete("ravi@example.com");
    expect((await w.drain(s.id)).send.status).toBe("sent");
    expect(m.outbox).toHaveLength(2);
    await expect(retry.execute({ actorId: w.owner.id, orgId: w.org.id, sendId: s.id, itemId: null })).rejects.toThrow(/Nothing to retry/);
  });
  it("gives up after three attempts", async () => {
    const w = await world();
    m.refusedRecipients.add("ravi@example.com");
    const s = await w.send({ recipientIds: [w.ravi.id] });
    const retry = new RetrySendItems(m.sendRepo, m.sendItemRepo, authz(), m.auditRepo);
    await w.drain(s.id);
    await retry.execute({ actorId: w.owner.id, orgId: w.org.id, sendId: s.id, itemId: null }); await w.drain(s.id);
    await retry.execute({ actorId: w.owner.id, orgId: w.org.id, sendId: s.id, itemId: null }); const last = await w.drain(s.id);
    expect(last.send.status).toBe("failed");
    await expect(retry.execute({ actorId: w.owner.id, orgId: w.org.id, sendId: s.id, itemId: null })).rejects.toThrow(/failed 3 times/);
  });
  it("a test send goes only to the sender, with [Test] in the subject, whatever recipients were chosen", async () => {
    const w = await world();
    const s = await w.send({ test: true, recipientIds: [] });
    await w.drain(s.id);
    expect(s.isTest).toBe(true);
    expect(m.outbox.map((e) => e.to.email)).toEqual(["o@example.com"]);
    expect(m.outbox[0]?.subject).toMatch(/^\[Test\] Bills for October 2026/);
  });
  it("checks recipients, connection, permission, org and the hourly limit before anything is created", async () => {
    const w = await world();
    await expect(w.send({ recipientIds: [] })).rejects.toThrow(/at least one recipient/);
    await expect(w.send({ recipientIds: ["00000000-0000-4000-8000-000000000000"] })).rejects.toThrow(/no longer exists/);
    await expect(w.send({ connectionId: w.drive.id })).rejects.toThrow(/Gmail or SMTP/);
    await expectCode(w.send({ actorId: w.viewer.id }), "forbidden");
    await expectCode(w.send({ actorId: w.stranger.id }), "not_found");
    const otherRecipient = await new SaveRecipient(m.recipientRepo, authz(), m.auditRepo).execute({ actorId: w.stranger.id, orgId: w.other.id, name: "E", email: "e@example.com" });
    await expect(w.send({ recipientIds: [otherRecipient.id] })).rejects.toThrow(/no longer exists/);
    m.limitAllows = false;
    await expectCode(w.send(), "rate_limited");
    expect(m.sendRows.size).toBe(0);
  });
  it("cancel stops the waiting emails; a finished send cannot be cancelled", async () => {
    const w = await world();
    const s = await w.send();
    await w.step(s.id);
    const cancel = new CancelSend(m.sendRepo, m.sendItemRepo, authz(), m.clock, m.auditRepo);
    await cancel.execute({ actorId: w.owner.id, orgId: w.org.id, sendId: s.id });
    expect(m.outbox).toHaveLength(1);
    expect((await w.step(s.id)).finished).toBe(true);
    expect(m.outbox).toHaveLength(1);
    await expect(cancel.execute({ actorId: w.owner.id, orgId: w.org.id, sendId: s.id })).rejects.toThrow(/already finished/);
    await expectCode(cancel.execute({ actorId: w.stranger.id, orgId: w.other.id, sendId: s.id }), "not_found");
  });
  it("fails the email with a clear message when the Drive connection or a file is gone", async () => {
    const w = await world();
    const s = await w.send({ recipientIds: [w.asha.id] });
    m.connections.delete(w.drive.id);
    await w.drain(s.id);
    expect((await m.sendItemRepo.list(w.org.id, s.id))[0]?.error).toMatch(/Google Drive connection/);
    expect(m.outbox).toHaveLength(0);
  });
  it("the sent log is per organisation", async () => {
    const w = await world();
    await w.send();
    const read = new ReadSends(m.sendRepo, m.sendItemRepo);
    expect(await read.list(w.org.id)).toHaveLength(1);
    expect(await read.list(w.other.id)).toHaveLength(0);
    expect(await read.get(w.other.id, [...m.sendRows.keys()][0] as string)).toBeNull();
  });
});
