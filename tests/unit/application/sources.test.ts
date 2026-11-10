import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors/domain-error";
import { AuthorizationService } from "@/server/application/authorization";
import { AddMailAccount, RemoveConnection } from "@/server/application/connections";
import { CompleteGoogleConnect } from "@/server/application/google-connect";
import { CreateOrg } from "@/server/application/create-org";
import { DeleteRunConfig, SaveRunConfig } from "@/server/application/run-configs";
import { TestSource } from "@/server/application/source-tester";
import { DeleteSource, SaveSource, type SourceInput } from "@/server/application/sources";
import { Memory } from "../../fakes/memory";

let m: Memory;
const authz = () => new AuthorizationService(m.orgRepo, m.memberRepo);
const expectCode = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toBeInstanceOf(DomainError);
  await p.catch((e: DomainError) => expect(e.code).toBe(code));
};
beforeEach(() => { m = new Memory(); });

async function world() {
  const owner = m.addUser("o@example.com");
  const viewer = m.addUser("v@example.com");
  const stranger = m.addUser("s@example.com");
  const org = await new CreateOrg(m.orgRepo, m.userRepo, m.auditRepo).execute({ userId: owner.id, name: "Home", defaultCurrency: "INR" });
  const other = await new CreateOrg(m.orgRepo, m.userRepo, m.auditRepo).execute({ userId: stranger.id, name: "Other", defaultCurrency: "INR" });
  await m.memberRepo.add(org.id, viewer.id, "viewer");
  const addMail = new AddMailAccount(m.connectionRepo, authz(), m.secretBox, m.probe, m.clock, m.auditRepo);
  const connectGoogle = new CompleteGoogleConnect(m.connectionRepo, authz(), m.secretBox, m.google, m.probe, m.clock, m.auditRepo);
  const mailbox = await addMail.execute({ actorId: owner.id, orgId: org.id, kind: "imap", label: "Bills", host: "imap.example.com", port: 993, secure: true, username: "bills@example.com", password: "pw" });
  const smtp = await addMail.execute({ actorId: owner.id, orgId: org.id, kind: "smtp", label: "Send", host: "smtp.example.com", port: 465, secure: true, username: "send@example.com", password: "pw" });
  const drive = await connectGoogle.execute({ actorId: owner.id, orgId: org.id, kind: "google_drive", code: "c", redirectUri: "r" });
  const strangerMailbox = await addMail.execute({ actorId: stranger.id, orgId: other.id, kind: "imap", label: "X", host: "imap.example.com", port: 993, secure: true, username: "x@example.com", password: "pw" });
  const save = new SaveSource(m.sourceRepo, m.connectionRepo, authz(), m.secretBox, m.auditRepo);
  const input = (over: Partial<SourceInput> = {}): SourceInput => ({
    actorId: owner.id, orgId: org.id, name: "Jio", connectionId: mailbox.id, senders: ["Billing@Jio.com", "jio.com"],
    subjectContains: " bill ", attachmentNameContains: null, requireAttachment: true, passwordMode: "subject_brackets", passwordPattern: null, staticPassword: null, ...over,
  });
  return { owner, viewer, stranger, org, other, mailbox, smtp, drive, strangerMailbox, save, input };
}

describe("SaveSource", () => {
  it("normalises and stores the rules, and audits without secrets", async () => {
    const w = await world();
    const s = await w.save.execute(w.input());
    expect(s).toMatchObject({ name: "Jio", matcher: { senders: ["billing@jio.com", "@jio.com"], subjectContains: "bill", requireAttachment: true }, passwordMode: "subject_brackets", passwordPattern: null, hasStaticPassword: false });
    expect(m.audit.at(-1)).toMatchObject({ action: "source.created", metadata: { name: "Jio", passwordMode: "subject_brackets" } });
  });
  it("seals a static password, never returns it, keeps it on edit, replaces it, and clears it when the mode changes", async () => {
    const w = await world();
    const s = await w.save.execute(w.input({ name: "Bank", passwordMode: "static", staticPassword: "pdf-pass-1" }));
    expect(JSON.stringify(s)).not.toContain("pdf-pass-1");
    expect(s.hasStaticPassword).toBe(true);
    const stored = () => m.sources.get(s.id)?.cipher ?? null;
    expect(stored()).not.toContain("pdf-pass-1");
    expect(await m.secretBox.decrypt(w.org.id, stored() ?? "")).toBe("pdf-pass-1");
    const before = stored();
    await w.save.execute(w.input({ id: s.id, name: "Bank", passwordMode: "static", staticPassword: "" })); // blank keeps
    expect(stored()).toBe(before);
    await w.save.execute(w.input({ id: s.id, name: "Bank", passwordMode: "static", staticPassword: "pdf-pass-2" }));
    expect(await m.secretBox.decrypt(w.org.id, stored() ?? "")).toBe("pdf-pass-2");
    const switched = await w.save.execute(w.input({ id: s.id, name: "Bank", passwordMode: "none" }));
    expect(switched.hasStaticPassword).toBe(false);
    expect(stored()).toBeNull();
    expect(JSON.stringify(m.audit)).not.toContain("pdf-pass");
  });
  it("requires a password when static is chosen for the first time", async () => {
    const w = await world();
    await expect(w.save.execute(w.input({ passwordMode: "static", staticPassword: "" }))).rejects.toThrow(/Enter the PDF password/);
    const s = await w.save.execute(w.input({ passwordMode: "none" }));
    await expect(w.save.execute(w.input({ id: s.id, passwordMode: "static", staticPassword: null }))).rejects.toThrow(/Enter the PDF password/);
  });
  it("validates names, senders, patterns and limits with readable messages", async () => {
    const w = await world();
    const fail = (over: Partial<SourceInput>, text: RegExp) => expect(w.save.execute(w.input(over))).rejects.toThrow(text);
    await fail({ name: "x" }, /2 to 60/);
    await fail({ senders: [] }, /at least one sender/);
    await fail({ senders: ["not an email"] }, /not an email address or a domain/);
    await fail({ senders: Array.from({ length: 11 }, (_, i) => `a${i}@x.com`) }, /at most 10/);
    await fail({ passwordMode: "subject_pattern", passwordPattern: "no group" }, /exactly one/);
    await fail({ subjectContains: "x".repeat(101) }, /at most 100/);
    await fail({ passwordMode: "bogus" as never }, /Choose how to open/);
  });
  it("only accepts a Gmail or IMAP mailbox from the same org", async () => {
    const w = await world();
    await expect(w.save.execute(w.input({ connectionId: w.smtp.id }))).rejects.toThrow(/Gmail or IMAP/);
    await expect(w.save.execute(w.input({ connectionId: w.drive.id }))).rejects.toThrow(/Gmail or IMAP/);
    await expect(w.save.execute(w.input({ connectionId: w.strangerMailbox.id }))).rejects.toThrow(/Gmail or IMAP/);
  });
  it("rejects duplicate names (case-insensitive) but allows saving a source under its own name", async () => {
    const w = await world();
    const s = await w.save.execute(w.input());
    await expect(w.save.execute(w.input({ name: "JIO" }))).rejects.toThrow(/already exists/);
    await expect(w.save.execute(w.input({ id: s.id, subjectContains: "invoice" }))).resolves.toMatchObject({ id: s.id });
  });
  it("enforces permissions and org isolation", async () => {
    const w = await world();
    await expectCode(w.save.execute(w.input({ actorId: w.viewer.id })), "forbidden");
    await expectCode(w.save.execute(w.input({ actorId: w.stranger.id })), "not_found");
    const s = await w.save.execute(w.input());
    await expectCode(w.save.execute(w.input({ actorId: w.stranger.id, orgId: w.other.id, connectionId: w.strangerMailbox.id, id: s.id })), "not_found");
    await expectCode(new DeleteSource(m.sourceRepo, authz(), m.auditRepo).execute({ actorId: w.viewer.id, orgId: w.org.id, sourceId: s.id }), "forbidden");
  });
  it("deletes a source and drops it from run configurations", async () => {
    const w = await world();
    const s = await w.save.execute(w.input());
    const rc = await new SaveRunConfig(m.runConfigRepo, m.sourceRepo, m.connectionRepo, authz(), m.auditRepo)
      .execute({ actorId: w.owner.id, orgId: w.org.id, name: "Monthly", driveConnectionId: w.drive.id, driveFolder: "Billfold", periodMode: "previous_month", sourceIds: [s.id] });
    await new DeleteSource(m.sourceRepo, authz(), m.auditRepo).execute({ actorId: w.owner.id, orgId: w.org.id, sourceId: s.id });
    expect(m.sources.size).toBe(0);
    expect(m.runConfigs.get(rc.id)?.sourceIds).toEqual([]);
  });
});

describe("TestSource (the source tester)", () => {
  const jio = { id: "1", from: "Jio Billing <billing@jio.com>", subject: "Your Jio bill is ready (abc123)", date: new Date("2026-10-30T00:00:00Z"), attachments: [{ name: "jio.pdf", size: 1 }] };
  const tester = () => new TestSource(m.connectionRepo, authz(), m.secretBox, m.mailSearch, m.clock);
  const run = async (over: Partial<Parameters<TestSource["execute"]>[0]> = {}) => {
    const w = await world();
    return { w, result: await tester().execute({ actorId: w.owner.id, orgId: w.org.id, name: "Jio", connectionId: w.mailbox.id, senders: ["@jio.com"], subjectContains: null, attachmentNameContains: null, requireAttachment: true, passwordMode: "subject_brackets", passwordPattern: null, windowDays: 90, ...over }) };
  };

  it("shows only emails that match every rule, with the password masked and never returned", async () => {
    m.mailbox = [jio, { ...jio, id: "2", from: "x@other.com" }, { ...jio, id: "3", attachments: [] }, { ...jio, id: "4", subject: "Reminder with no password" }];
    const { result } = await run();
    expect(result.scanned).toBe(4);
    expect(result.matches.map((x) => x.subject)).toEqual(["Your Jio bill is ready ([redacted])", "Reminder with no password"]);
    expect(result.matches.map((x) => x.passwordFound)).toEqual([true, false]);
    expect(JSON.stringify(result)).not.toContain("abc123");
    expect(result.matches[0]).toMatchObject({ from: "billing@jio.com", attachments: ["jio.pdf"] });
  });
  it("reports no password info for modes that do not read the subject", async () => {
    m.mailbox = [jio];
    const { result } = await run({ passwordMode: "none" });
    expect(result.matches[0]?.passwordFound).toBeNull();
    expect(result.matches[0]?.subject).toContain("abc123"); // nothing to hide when the subject holds no password
  });
  it("sends the decrypted mailbox login to the search, clamps the window, and caps the list at 20", async () => {
    m.mailbox = Array.from({ length: 30 }, (_, i) => ({ ...jio, id: String(i), date: new Date(Date.UTC(2026, 9, 1 + i)) }));
    const { result } = await run({ windowDays: 100_000 });
    expect(result.windowDays).toBe(365);
    expect(result.matches).toHaveLength(20);
    expect(result.matches[0]?.date.getTime()).toBeGreaterThan(result.matches[19]?.date.getTime() ?? 0); // newest first
    const call = m.searched.at(-1);
    expect(call?.secretJson).toContain("pw");
    expect(call?.limit).toBe(100);
    expect(call && call.before.getTime() - call.since.getTime()).toBe(365 * 86_400_000);
  });
  it("hides provider errors (which can contain credentials) behind a safe message", async () => {
    m.searchFails = true;
    await expect(run()).rejects.toThrow("Could not read the mailbox. Test the connection on the Connections page first.");
  });
  it("validates the rules, needs a real mailbox of the org, and is for managers only", async () => {
    const w = await world();
    const base = { orgId: w.org.id, name: "Jio", connectionId: w.mailbox.id, senders: ["@jio.com"], subjectContains: null, attachmentNameContains: null, requireAttachment: true, passwordMode: "none" as const, passwordPattern: null, windowDays: 30 };
    await expect(tester().execute({ ...base, actorId: w.owner.id, senders: [] })).rejects.toThrow(/at least one sender/);
    await expect(tester().execute({ ...base, actorId: w.owner.id, connectionId: w.strangerMailbox.id })).rejects.toThrow(/Gmail or IMAP/);
    await expect(tester().execute({ ...base, actorId: w.owner.id, connectionId: w.smtp.id })).rejects.toThrow(/Gmail or IMAP/);
    await expectCode(tester().execute({ ...base, actorId: w.viewer.id }), "forbidden");
    await expectCode(tester().execute({ ...base, actorId: w.stranger.id }), "not_found");
  });
});

describe("run configurations", () => {
  const saver = () => new SaveRunConfig(m.runConfigRepo, m.sourceRepo, m.connectionRepo, authz(), m.auditRepo);
  it("must choose a Google Drive connection and existing sources of the same org", async () => {
    const w = await world();
    const s = await w.save.execute(w.input());
    const otherSource = await new SaveSource(m.sourceRepo, m.connectionRepo, authz(), m.secretBox, m.auditRepo)
      .execute({ actorId: w.stranger.id, orgId: w.other.id, name: "Theirs", connectionId: w.strangerMailbox.id, senders: ["a@b.com"], subjectContains: null, attachmentNameContains: null, requireAttachment: true, passwordMode: "none", passwordPattern: null, staticPassword: null });
    const base = { actorId: w.owner.id, orgId: w.org.id, name: "Monthly", driveConnectionId: w.drive.id, driveFolder: " Billfold ", periodMode: "previous_month" as const, sourceIds: [s.id, s.id] };
    const rc = await saver().execute(base);
    expect(rc).toMatchObject({ name: "Monthly", driveFolder: "Billfold", sourceIds: [s.id], periodMode: "previous_month" });
    await expect(saver().execute({ ...base, name: "Beta", driveConnectionId: w.mailbox.id })).rejects.toThrow(/Google Drive/);
    await expect(saver().execute({ ...base, name: "Gamma", driveConnectionId: w.smtp.id })).rejects.toThrow(/Google Drive/);
    await expect(saver().execute({ ...base, name: "Delta", sourceIds: [otherSource.id] })).rejects.toThrow(/no longer exists/);
    await expect(saver().execute({ ...base, name: "Eps", sourceIds: [] })).rejects.toThrow(/at least one source/);
    await expect(saver().execute({ ...base, name: "MONTHLY" })).rejects.toThrow(/already exists/);
  });
  it("validates folder and month choices", async () => {
    const w = await world();
    const s = await w.save.execute(w.input());
    const base = { actorId: w.owner.id, orgId: w.org.id, name: "Monthly", driveConnectionId: w.drive.id, driveFolder: "Billfold", periodMode: "previous_month" as const, sourceIds: [s.id] };
    await expect(saver().execute({ ...base, driveFolder: "a/b" })).rejects.toThrow(/slashes/);
    await expect(saver().execute({ ...base, driveFolder: ".." })).rejects.toThrow(/slashes/);
    await expect(saver().execute({ ...base, driveFolder: "" })).rejects.toThrow(/1 to 100/);
    await expect(saver().execute({ ...base, periodMode: "bogus" as never })).rejects.toThrow(/which month/);
  });
  it("edits replace the source list; permissions and org isolation hold; delete works", async () => {
    const w = await world();
    const a = await w.save.execute(w.input({ name: "Alpha" }));
    const b = await w.save.execute(w.input({ name: "Bravo" }));
    const base = { actorId: w.owner.id, orgId: w.org.id, name: "Monthly", driveConnectionId: w.drive.id, driveFolder: "Billfold", periodMode: "previous_month" as const, sourceIds: [a.id] };
    const rc = await saver().execute(base);
    const edited = await saver().execute({ ...base, id: rc.id, sourceIds: [b.id], periodMode: "current_month" });
    expect(edited).toMatchObject({ id: rc.id, sourceIds: [b.id], periodMode: "current_month" });
    expect(m.runConfigs.size).toBe(1);
    await expectCode(saver().execute({ ...base, actorId: w.viewer.id, name: "Viewer attempt" }), "forbidden");
    // Someone from another org cannot reach this configuration by id, even as an owner of their own org.
    await expect(saver().execute({ ...base, actorId: w.stranger.id, orgId: w.other.id, id: rc.id })).rejects.toBeInstanceOf(DomainError);
    expect(m.runConfigs.get(rc.id)).toMatchObject({ orgId: w.org.id, sourceIds: [b.id] });
    await expectCode(new DeleteRunConfig(m.runConfigRepo, authz(), m.auditRepo).execute({ actorId: w.viewer.id, orgId: w.org.id, runConfigId: rc.id }), "forbidden");
    await new DeleteRunConfig(m.runConfigRepo, authz(), m.auditRepo).execute({ actorId: w.owner.id, orgId: w.org.id, runConfigId: rc.id });
    expect(m.runConfigs.size).toBe(0);
  });
});

describe("removing a connection that is in use", () => {
  it("is refused with a message naming what depends on it, and works once those are gone", async () => {
    const w = await world();
    const s = await w.save.execute(w.input());
    const rc = await new SaveRunConfig(m.runConfigRepo, m.sourceRepo, m.connectionRepo, authz(), m.auditRepo)
      .execute({ actorId: w.owner.id, orgId: w.org.id, name: "Monthly", driveConnectionId: w.drive.id, driveFolder: "Billfold", periodMode: "previous_month", sourceIds: [s.id] });
    const remove = new RemoveConnection(m.connectionRepo, authz(), m.auditRepo, m.secretBox, m.google, m.usage);
    await expect(remove.execute({ actorId: w.owner.id, orgId: w.org.id, connectionId: w.mailbox.id })).rejects.toThrow('used by source "Jio"');
    await expect(remove.execute({ actorId: w.owner.id, orgId: w.org.id, connectionId: w.drive.id })).rejects.toThrow('run config "Monthly"');
    expect(m.connections.size).toBe(4);
    await new DeleteRunConfig(m.runConfigRepo, authz(), m.auditRepo).execute({ actorId: w.owner.id, orgId: w.org.id, runConfigId: rc.id });
    await new DeleteSource(m.sourceRepo, authz(), m.auditRepo).execute({ actorId: w.owner.id, orgId: w.org.id, sourceId: s.id });
    await remove.execute({ actorId: w.owner.id, orgId: w.org.id, connectionId: w.mailbox.id });
    await remove.execute({ actorId: w.owner.id, orgId: w.org.id, connectionId: w.drive.id });
    expect(m.connections.size).toBe(2);
  });
});
