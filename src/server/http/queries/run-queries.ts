import "server-only";
import { ORG_UTC_OFFSET_MINUTES } from "@/constants/app";
import { currencyByCode } from "@/domain/value-objects/currency";
import { resolvePeriod } from "@/domain/value-objects/period";
import { MAX_ITEM_ATTEMPTS } from "@/domain/value-objects/bill-data";
import type { BillRecord, RunItemRecord, RunRecord } from "@/domain/ports/records";
import { formatMoney } from "@/lib/format-money";
import type { BillBriefDto, RunCountsDto, RunDetailDto, RunItemDto, RunSummaryDto, StartRunOptions } from "@/types/run";
import { StartRun } from "../../application/runs";
import { container } from "../../composition-root/container";
import { runConfigRecords } from "./request-memo";

const summary = (run: RunRecord, counts: RunCountsDto): RunSummaryDto => ({
  id: run.id, configName: run.configName, periodKey: run.periodKey, status: run.status,
  createdAt: run.createdAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null, counts,
});

function billBrief(bill: BillRecord): BillBriefDto {
  const currency = currencyByCode(bill.currency);
  return {
    amountText: bill.amountMinor !== null && currency ? formatMoney({ minor: bill.amountMinor, currency }) : null,
    needsReview: bill.needsReview, confidence: bill.confidence, method: bill.method, note: bill.note,
    billDate: bill.billDate, dueDate: bill.dueDate, driveLink: bill.files[0]?.webViewLink ?? null,
  };
}

export function toItemDto(item: RunItemRecord, bill: BillRecord | null): RunItemDto {
  return {
    id: item.id, sourceName: item.sourceName, subject: item.subject, fromAddress: item.fromAddress, messageDate: item.messageDate.toISOString(),
    attachmentName: item.attachmentName, status: item.status, error: item.error, attempts: item.attempts,
    canRetry: item.status === "failed" && item.attempts < MAX_ITEM_ATTEMPTS, bill: bill ? billBrief(bill) : null,
  };
}

export async function listRuns(orgId: string, limit = 20): Promise<RunSummaryDto[]> {
  return (await container().listRuns.recent(orgId, limit)).map(({ run, counts }) => summary(run, counts));
}

export async function getRun(orgId: string, runId: string): Promise<RunDetailDto | null> {
  const detail = await container().listRuns.detail(orgId, runId);
  if (!detail) return null;
  return { ...summary(detail.run, detail.counts), items: detail.items.map((i) => toItemDto(i, i.billId ? (detail.bills.get(i.billId) ?? null) : null)) };
}

export async function startRunOptions(orgId: string): Promise<StartRunOptions> {
  const now = new Date();
  const configs = await runConfigRecords(orgId);
  return {
    configs: configs.filter((c) => c.sourceIds.length > 0).map((c) => ({ id: c.id, name: c.name, defaultPeriod: resolvePeriod(c.periodMode, now, ORG_UTC_OFFSET_MINUTES).key })),
    periods: StartRun.selectablePeriods(now),
  };
}
