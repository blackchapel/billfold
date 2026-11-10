import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/domain/errors/domain-error";
import type { NewBill } from "@/domain/ports/records";
import { AuthorizationService } from "@/server/application/authorization";
import { CreateOrg } from "@/server/application/create-org";
import { CreateManualBill, ListBills, MarkBillChecked, SetBillDeleted, SetBillPaid, UpdateBill, type BillFields } from "@/server/application/bills";
import { ReportService } from "@/server/application/report-service";
import { Memory } from "../../fakes/memory";

let m: Memory;
const authz = () => new AuthorizationService(m.orgRepo, m.memberRepo);
const expectCode = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toBeInstanceOf(DomainError);
  await p.catch((e: DomainError) => expect(e.code).toBe(code));
};
beforeEach(() => { m = new Memory(); }); // "now" is 1 Nov 2026, so the current month is 2026-11

const newBill = (over: Partial<NewBill> = {}): NewBill => ({
  periodKey: "2026-10", sourceId: "src-1", sourceName: "Jio", billerName: "Jio", amountMinor: 123_450n, currency: "INR", billDate: "2026-10-30", dueDate: "2026-11-15",
  confidence: "high", method: "text", needsReview: false, note: null, messageKey: `k-${Math.random()}`, createdBy: "u", ...over,
});
const file = { driveConnectionId: "c", driveAccount: "d@example.com", driveFileId: "f", driveFolderId: "fo", webViewLink: "https://drive.test/1", name: "x.pdf", mimeType: "application/pdf", sizeBytes: 1, sha256: "ab" };
const fields = (over: Partial<BillFields> = {}): BillFields => ({ billerName: "Jio", amountText: "1,234.50", periodKey: "2026-10", billDate: "2026-10-30", dueDate: "2026-11-15", note: "", ...over });

async function world() {
  const owner = m.addUser("o@example.com");
  const member = m.addUser("m@example.com");
  const viewer = m.addUser("v@example.com");
  const stranger = m.addUser("s@example.com");
  const org = await new CreateOrg(m.orgRepo, m.userRepo, m.auditRepo).execute({ userId: owner.id, name: "Home", defaultCurrency: "INR" });
  const other = await new CreateOrg(m.orgRepo, m.userRepo, m.auditRepo).execute({ userId: stranger.id, name: "Other", defaultCurrency: "INR" });
  await m.memberRepo.add(org.id, member.id, "member");
  await m.memberRepo.add(org.id, viewer.id, "viewer");
  const bill = await m.billRepo.record(org.id, newBill({ messageKey: "jio-oct" }), file);
  const scan = await m.billRepo.record(org.id, newBill({ billerName: "Scanned", sourceName: "Scans", amountMinor: null, needsReview: true, confidence: "low", messageKey: "scan-oct", note: "scan" }), file);
  const update = new UpdateBill(m.billRepo, authz(), m.clock, m.auditRepo);
  const manual = new CreateManualBill(m.billRepo, authz(), m.clock, m.auditRepo);
  const paid = new SetBillPaid(m.billRepo, authz(), m.clock, m.auditRepo);
  const deleter = new SetBillDeleted(m.billRepo, authz(), m.clock, m.auditRepo);
  return { owner, member, viewer, stranger, org, other, bill, scan, update, manual, paid, deleter };
}

describe("UpdateBill", () => {
  it("corrects a flagged bill and marks it as checked by a person", async () => {
    const w = await world();
    const out = await w.update.execute({ actorId: w.member.id, orgId: w.org.id, billId: w.scan.id, fields: fields({ billerName: " Scanned Power ", amountText: "₹2,310.00", dueDate: "2026-11-20", note: "Read from the paper copy" }), markChecked: true });
    expect(out).toMatchObject({ billerName: "Scanned Power", amountMinor: 231_000n, dueDate: "2026-11-20", needsReview: false, note: "Read from the paper copy" });
    expect(out.reviewedAt).toEqual(m.now);
    expect(m.bills.get(w.scan.id)).toMatchObject({ needsReview: false, reviewedBy: w.member.id }); // who checked it is kept
    expect(m.audit.at(-1)).toMatchObject({ action: "bill.updated", metadata: { checked: true, period: "2026-10", changed: ["billerName", "amountMinor", "dueDate", "note"] } });
  });
  it("keeps a bill flagged when it is saved without being marked as checked", async () => {
    const w = await world();
    const out = await w.update.execute({ actorId: w.owner.id, orgId: w.org.id, billId: w.scan.id, fields: fields({ billerName: "Scanned", amountText: "" }), markChecked: false });
    expect(out).toMatchObject({ amountMinor: null, needsReview: true, reviewedAt: null });
  });
  it("reports only the fields that really changed", async () => {
    const w = await world();
    await w.update.execute({ actorId: w.owner.id, orgId: w.org.id, billId: w.bill.id, fields: fields(), markChecked: true });
    expect(m.audit.at(-1)?.metadata).toMatchObject({ changed: [] });
  });
  it("refuses values that make no sense, with a message that says what to fix", async () => {
    const w = await world();
    const run = (f: Partial<BillFields>) => w.update.execute({ actorId: w.owner.id, orgId: w.org.id, billId: w.bill.id, fields: fields(f), markChecked: true });
    await expect(run({ billerName: "  " })).rejects.toThrow(/Biller name/);
    await expect(run({ billerName: "x".repeat(81) })).rejects.toThrow(/Biller name/);
    await expect(run({ amountText: "abc" })).rejects.toThrow(/as a number/);
    await expect(run({ amountText: "12.345" })).rejects.toThrow(/as a number/);
    await expect(run({ amountText: "0" })).rejects.toThrow(/more than zero/);
    await expect(run({ amountText: "-5" })).rejects.toThrow(/more than zero/);
    await expect(run({ amountText: "1000000000000" })).rejects.toThrow(/too large/);
    await expect(run({ periodKey: "2026-13" })).rejects.toThrow(/month/);
    await expect(run({ periodKey: "2026-12" })).rejects.toThrow(/not started/);
    await expect(run({ billDate: "2026-02-31" })).rejects.toThrow(/bill date is not a real date/);
    await expect(run({ dueDate: "15/12/2026" })).rejects.toThrow(/due date is not a real date/);
    await expect(run({ note: "n".repeat(301) })).rejects.toThrow(/300 characters/);
    expect(m.bills.get(w.bill.id)?.amountMinor).toBe(123_450n); // nothing was saved
  });
  it("accepts the current month and clears optional dates", async () => {
    const w = await world();
    const out = await w.update.execute({ actorId: w.owner.id, orgId: w.org.id, billId: w.bill.id, fields: fields({ periodKey: "2026-11", billDate: "", dueDate: "" }), markChecked: false });
    expect(out).toMatchObject({ periodKey: "2026-11", billDate: null, dueDate: null });
  });
  it("will not change a deleted bill", async () => {
    const w = await world();
    await w.deleter.execute({ actorId: w.owner.id, orgId: w.org.id, billId: w.bill.id, deleted: true });
    await expect(w.update.execute({ actorId: w.owner.id, orgId: w.org.id, billId: w.bill.id, fields: fields(), markChecked: true })).rejects.toThrow(/Restore it/);
  });
  it("needs bills.edit, and never reaches another org's bills", async () => {
    const w = await world();
    const run = (actorId: string, orgId: string) => w.update.execute({ actorId, orgId, billId: w.bill.id, fields: fields(), markChecked: true });
    await expectCode(run(w.viewer.id, w.org.id), "forbidden");
    await expectCode(run(w.stranger.id, w.org.id), "not_found");
    await expectCode(run(w.stranger.id, w.other.id), "not_found"); // their own org, but not their bill
  });
});

describe("MarkBillChecked", () => {
  it("clears the review flag and records who looked, without changing anything else", async () => {
    const w = await world();
    const check = new MarkBillChecked(m.billRepo, authz(), m.clock, m.auditRepo);
    await check.execute({ actorId: w.member.id, orgId: w.org.id, billId: w.scan.id });
    expect(m.bills.get(w.scan.id)).toMatchObject({ needsReview: false, reviewedBy: w.member.id, amountMinor: null, note: "scan" });
    expect(m.audit.at(-1)).toMatchObject({ action: "bill.checked", metadata: { biller: "Scanned" } });
    await expectCode(check.execute({ actorId: w.viewer.id, orgId: w.org.id, billId: w.scan.id }), "forbidden");
    await expectCode(check.execute({ actorId: w.stranger.id, orgId: w.other.id, billId: w.scan.id }), "not_found");
    await w.deleter.execute({ actorId: w.owner.id, orgId: w.org.id, billId: w.scan.id, deleted: true });
    await expect(check.execute({ actorId: w.owner.id, orgId: w.org.id, billId: w.scan.id })).rejects.toThrow(/Restore/);
  });
});

describe("CreateManualBill", () => {
  it("adds a bill by hand: no email, no file, already checked, never refiled", async () => {
    const w = await world();
    const bill = await w.manual.execute({ actorId: w.member.id, orgId: w.org.id, fields: fields({ billerName: "Maid", amountText: "3000", dueDate: "" }) });
    expect(bill).toMatchObject({ billerName: "Maid", amountMinor: 300_000n, method: "manual", confidence: "high", needsReview: false, sourceId: null, sourceName: "Added by hand", files: [] });
    expect(bill.messageKey).toMatch(/^manual:[0-9a-f-]{36}$/);
    expect(m.bills.get(bill.id)?.reviewedAt).toEqual(m.now);
    const another = await w.manual.execute({ actorId: w.member.id, orgId: w.org.id, fields: fields({ billerName: "Maid", amountText: "3000" }) });
    expect(another.messageKey).not.toBe(bill.messageKey);
    expect(m.audit.at(-1)).toMatchObject({ action: "bill.created_manually" });
  });
  it("needs an amount, a valid month, and permission", async () => {
    const w = await world();
    await expect(w.manual.execute({ actorId: w.owner.id, orgId: w.org.id, fields: fields({ amountText: "" }) })).rejects.toThrow(/Enter the amount/);
    await expect(w.manual.execute({ actorId: w.owner.id, orgId: w.org.id, fields: fields({ periodKey: "2027-01" }) })).rejects.toThrow(/not started/);
    await expectCode(w.manual.execute({ actorId: w.viewer.id, orgId: w.org.id, fields: fields() }), "forbidden");
    await expectCode(w.manual.execute({ actorId: w.stranger.id, orgId: w.org.id, fields: fields() }), "not_found");
  });
});

describe("SetBillPaid and SetBillDeleted", () => {
  it("marks paid and unpaid with the time, and audits it", async () => {
    const w = await world();
    await w.paid.execute({ actorId: w.member.id, orgId: w.org.id, billId: w.bill.id, paid: true });
    expect(m.bills.get(w.bill.id)?.paidAt).toEqual(m.now);
    expect(m.audit.at(-1)?.action).toBe("bill.marked_paid");
    await w.paid.execute({ actorId: w.member.id, orgId: w.org.id, billId: w.bill.id, paid: false });
    expect(m.bills.get(w.bill.id)?.paidAt).toBeNull();
    expect(m.audit.at(-1)?.action).toBe("bill.marked_unpaid");
    await expectCode(w.paid.execute({ actorId: w.viewer.id, orgId: w.org.id, billId: w.bill.id, paid: true }), "forbidden");
    await expectCode(w.paid.execute({ actorId: w.stranger.id, orgId: w.other.id, billId: w.bill.id, paid: true }), "not_found");
  });
  it("hides a deleted bill from lists, keeps its email marked as filed, and restores it", async () => {
    const w = await world();
    const list = new ListBills(m.billRepo);
    await w.deleter.execute({ actorId: w.member.id, orgId: w.org.id, billId: w.bill.id, deleted: true });
    expect((await list.list(w.org.id, {})).map((b) => b.id)).toEqual([w.scan.id]);
    expect((await list.list(w.org.id, { deleted: "only" })).map((b) => b.id)).toEqual([w.bill.id]);
    expect(await m.billRepo.existingKeys(w.org.id, ["jio-oct"])).toEqual(new Set(["jio-oct"])); // a later run will not file it again
    await expectCode(w.paid.execute({ actorId: w.owner.id, orgId: w.org.id, billId: w.bill.id, paid: true }), "validation");
    await w.deleter.execute({ actorId: w.member.id, orgId: w.org.id, billId: w.bill.id, deleted: false });
    expect((await list.list(w.org.id, {})).map((b) => b.id).sort()).toEqual([w.bill.id, w.scan.id].sort());
    expect(m.audit.map((a) => a.action).filter((a) => a.startsWith("bill."))).toEqual(["bill.deleted", "bill.restored"]);
    await expectCode(w.deleter.execute({ actorId: w.viewer.id, orgId: w.org.id, billId: w.bill.id, deleted: true }), "forbidden");
  });
});

describe("ListBills", () => {
  it("filters by month, review state, unpaid and a search that ignores case, and stays inside the org", async () => {
    const w = await world();
    await m.billRepo.record(w.org.id, newBill({ periodKey: "2026-09", billerName: "Airtel", sourceName: "Phone", messageKey: "air-sep" }), file);
    await m.billRepo.record(w.other.id, newBill({ billerName: "Jio", messageKey: "other-org" }), file);
    await w.paid.execute({ actorId: w.owner.id, orgId: w.org.id, billId: w.bill.id, paid: true });
    const list = new ListBills(m.billRepo);
    const names = async (f: Parameters<ListBills["list"]>[1]) => (await list.list(w.org.id, f)).map((b) => b.billerName).sort();
    expect(await names({})).toEqual(["Airtel", "Jio", "Scanned"]);
    expect(await names({ periodKey: "2026-09" })).toEqual(["Airtel"]);
    expect(await names({ fromPeriod: "2026-10" })).toEqual(["Jio", "Scanned"]);
    expect(await names({ toPeriod: "2026-09" })).toEqual(["Airtel"]);
    expect(await names({ needsReview: true })).toEqual(["Scanned"]);
    expect(await names({ unpaid: true })).toEqual(["Airtel", "Scanned"]);
    expect(await names({ search: "  AIR " })).toEqual(["Airtel"]);
    expect(await names({ search: "scans" })).toEqual(["Scanned"]); // source name counts too
    expect(await list.find(w.other.id, w.bill.id)).toBeNull();
  });
});

describe("ReportService", () => {
  it("reads only the window it reports on plus unpaid and flagged bills of any age, and gives the same answer as reading everything", async () => {
    const w = await world();
    // Years of settled history that no report on October 2026 should need.
    for (let i = 0; i < 30; i++) {
      const bill = await m.billRepo.record(w.org.id, newBill({ periodKey: `${2022 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, amountMinor: 1_000n, messageKey: `old-${i}` }), file);
      await w.paid.execute({ actorId: w.owner.id, orgId: w.org.id, billId: bill.id, paid: true });
    }
    await m.billRepo.record(w.org.id, newBill({ periodKey: "2023-02", billerName: "Ancient", messageKey: "ancient-unpaid", dueDate: "2023-03-01" }), file); // still owed
    const asked: string[] = [];
    const spy = { ...m.billRepo, list: async () => { asked.push("list"); throw new Error("the report must not load every bill"); } };
    const report = await new ReportService(spy as typeof m.billRepo, m.clock).build(w.org.id, null);
    expect(asked).toEqual([]);
    expect(report.overdue.map((b) => b.billerName)).toContain("Ancient"); // an old unpaid bill is still overdue
    expect(report.trend).toHaveLength(12);
    expect(report.trend.at(-1)).toMatchObject({ periodKey: "2026-10", count: 2 });
    expect(report.monthsWithBills).toContain("2022-01"); // every month that has bills can be opened
    expect(report.insights.some((i) => /needs? a quick check/.test(i.text))).toBe(true); // the flagged scan still counts
  });

  it("builds the month, the 12-month trend, the biller table, overdue and upcoming bills and the insights from live bills", async () => {
    const w = await world();
    await m.billRepo.record(w.org.id, newBill({ periodKey: "2026-09", amountMinor: 100_000n, messageKey: "jio-sep", dueDate: "2026-10-12" }), file); // old and unpaid: overdue
    await m.billRepo.record(w.org.id, newBill({ billerName: "Power", amountMinor: 50_000n, messageKey: "pw-oct", dueDate: "2026-11-05" }), file); // due within a week of 1 Nov
    const hidden = await m.billRepo.record(w.org.id, newBill({ billerName: "Deleted", amountMinor: 9_999_900n, messageKey: "del" }), file);
    await w.deleter.execute({ actorId: w.owner.id, orgId: w.org.id, billId: hidden.id, deleted: true });
    const report = await new ReportService(m.billRepo, m.clock).build(w.org.id, null);

    expect(report.periodKey).toBe("2026-10"); // newest month that has bills
    expect(report.monthInProgress).toBe(false); // October is over on 1 November
    expect(report.monthsWithBills).toEqual(["2026-10", "2026-09"]);
    expect(report.trend).toHaveLength(12);
    expect(report.trend[0]?.periodKey).toBe("2025-11");
    expect(report.trend.at(-1)).toEqual({ periodKey: "2026-10", totalMinor: 173_450n, count: 3, missingAmount: 1 });
    expect(report.trend.at(-2)).toMatchObject({ periodKey: "2026-09", totalMinor: 100_000n });
    expect(report.month.totalMinor).toBe(173_450n);
    expect((await new ReportService(m.billRepo, m.clock).build(w.org.id, "2026-11")).monthInProgress).toBe(true); // the current month is still running
    expect(report.breakdown.map((r) => r.biller)).toEqual(["Jio", "Power", "Scanned"]);
    expect(report.breakdown[0]).toMatchObject({ previousMinor: 100_000n, changePercent: 23 });
    expect(report.overdue.map((b) => b.messageKey)).toEqual(["jio-sep"]);
    expect(report.dueSoon.map((b) => b.billerName)).toEqual(["Power"]);
    expect(report.unpaidTotalMinor).toBe(173_450n);
    expect(report.insights.map((i) => i.text)).toEqual(expect.arrayContaining([
      "1 bill needs a quick check before you rely on the numbers.",
      expect.stringContaining("past the due date"),
      expect.stringContaining("due in the next 7 days"),
    ]));
    expect(JSON.stringify(report, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain("Deleted");
  });
  it("a paid bill is not overdue, and an explicit month can be chosen", async () => {
    const w = await world();
    const old = await m.billRepo.record(w.org.id, newBill({ periodKey: "2026-09", messageKey: "jio-sep", dueDate: "2026-10-12" }), file);
    await w.paid.execute({ actorId: w.owner.id, orgId: w.org.id, billId: old.id, paid: true });
    const service = new ReportService(m.billRepo, m.clock);
    const sep = await service.build(w.org.id, "2026-09");
    expect(sep).toMatchObject({ periodKey: "2026-09", overdue: [], unpaidTotalMinor: 0n });
    expect(sep.trend.at(-1)?.periodKey).toBe("2026-09");
    expect((await service.build(w.org.id, "1999-01")).periodKey).toBe("2026-10"); // nonsense falls back
    expect((await service.build(w.org.id, "2026-11")).periodKey).toBe("2026-11"); // this month is always allowed
    const empty = await service.build(w.org.id, "2026-03"); // a month with no bills still opens (the chart links to every column)
    expect(empty).toMatchObject({ periodKey: "2026-03", breakdown: [], month: { count: 0, totalMinor: 0n } });
    expect(empty.monthsWithBills).toEqual(["2026-10", "2026-09"]);
    expect((await service.build(w.org.id, "2027-01")).periodKey).toBe("2026-10"); // the future is not a month yet: newest month with bills
    expect((await service.build(w.org.id, "nonsense")).periodKey).toBe("2026-10");
  });
  it("works for an org with no bills", async () => {
    const w = await world();
    const report = await new ReportService(m.billRepo, m.clock).build(w.other.id, null);
    expect(report).toMatchObject({ periodKey: "2026-11", monthsWithBills: [], breakdown: [], overdue: [], dueSoon: [], insights: [], unpaidTotalMinor: 0n });
    expect(report.trend.every((p) => p.totalMinor === 0n && p.count === 0)).toBe(true);
  });
});
