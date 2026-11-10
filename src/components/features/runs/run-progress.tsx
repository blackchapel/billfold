"use client";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ITEM_STATUS_LABELS, RUN_STATUS_LABELS, periodLabel } from "@/constants/runs";
import type { ActionState } from "@/types/action";
import type { RunCountsDto, RunDetailDto, RunItemDto, StepDto } from "@/types/run";

interface Props {
  initial: RunDetailDto;
  /** False for people who may look but not run (viewers). Nothing is processed from their screen. */
  canExecute: boolean;
  processNext: () => Promise<ActionState<StepDto>>;
  cancel: () => Promise<ActionState>;
  retry: (itemId: string | null) => Promise<ActionState<number>>;
}

const tone = (status: string) => (status === "done" ? "good" : status === "failed" ? "bad" : status === "processing" ? "warn" : "neutral") as "good" | "bad" | "warn" | "neutral";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const settledOf = (c: RunCountsDto) => c.done + c.failed + c.skipped;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ItemRow({ item, canExecute, onRetry }: { item: RunItemDto; canExecute: boolean; onRetry: (id: string) => void }) {
  const bill = item.bill;
  return (
    <li data-status={item.status} className="flex flex-col gap-1 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><span className="font-medium">{item.sourceName}</span><span className="text-muted"> · {day(item.messageDate)}</span></span>
        <Badge tone={tone(item.status)}>{ITEM_STATUS_LABELS[item.status] ?? item.status}</Badge>
      </div>
      <p className="text-xs text-muted">{item.subject || "(no subject)"}{item.attachmentName ? ` · ${item.attachmentName}` : item.status !== "failed" ? " · email text" : ""}</p>
      {bill && (
        <p className="text-sm">
          <span className="font-medium tabular-nums">{bill.amountText ?? "Amount not found"}</span>
          {bill.dueDate && <span className="text-muted"> · due {day(bill.dueDate)}</span>}
          {bill.needsReview && <span className="ml-2"><Badge tone="warn">needs review</Badge></span>}
          {bill.driveLink && <> · <a href={bill.driveLink} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Open in Drive</a></>}
        </p>
      )}
      {bill?.note && <p className="text-xs text-muted">{bill.note}</p>}
      {item.error && <p className={`text-xs ${item.status === "failed" ? "text-danger" : "text-muted"}`}>{item.error}</p>}
      {canExecute && item.canRetry && <p><button type="button" onClick={() => onRetry(item.id)} className="text-xs underline underline-offset-4">Try again</button></p>}
    </li>
  );
}

export function RunProgress({ initial, canExecute, processNext, cancel, retry }: Props) {
  const [items, setItems] = useState(initial.items);
  const [counts, setCounts] = useState<RunCountsDto>(initial.counts);
  const [status, setStatus] = useState(initial.status);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Two overlapping requests can answer out of order; never let an older answer move the progress backwards.
  const furthest = useRef(settledOf(initial.counts));

  const total = counts.pending + counts.processing + counts.done + counts.failed + counts.skipped;
  const settled = counts.done + counts.failed + counts.skipped;
  const working = status === "processing" && counts.pending + counts.processing > 0;

  // The loop: file one item per request until none are left, so a request stays short and one bad email can only hurt itself.
  useEffect(() => {
    if (!canExecute || paused || !working) return;
    let stop = false;
    void (async () => {
      while (!stop) {
        const res = await processNext();
        // Always show what the server just did, even if this loop was told to stop meanwhile (pause, or React restarting
        // the effect): the item has been filed or has failed for real, and dropping the result would leave it looking "Waiting".
        if (!res.ok) { if (!stop) { setMessage(res.message); setPaused(true); } return; }
        const { item, counts: next, runStatus, finished } = res.data;
        if (settledOf(next) >= furthest.current) {
          furthest.current = settledOf(next);
          setCounts(next);
          setStatus(runStatus);
        }
        if (item) setItems((list) => list.map((x) => (x.id === item.id ? item : x)));
        if (finished || stop) return;
        if (!item) await sleep(3000); // another screen is filing the last item; check again shortly
      }
    })();
    return () => { stop = true; };
  }, [canExecute, paused, working, processNext]);

  const apply = async (task: () => Promise<ActionState<unknown>>, after?: () => void) => {
    setBusy(true);
    setMessage(null);
    const res = await task();
    setBusy(false);
    if (!res.ok) { setMessage(res.message); return; }
    after?.();
  };
  const reload = () => window.location.reload(); // simplest way to show the fresh list after a retry or cancel

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif text-2xl">{RUN_STATUS_LABELS[status] ?? status}</h2>
        {working && !paused && <span className="text-sm text-muted" role="status">Filing bills, please keep this page open…</span>}
        {working && paused && <span className="text-sm text-muted">Paused</span>}
      </div>
      <div className="mt-3" role="progressbar" aria-label="Run progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={settled}>
        <div className="h-2 rounded-sm bg-surface"><div className="h-2 rounded-sm bg-accent" style={{ width: total ? `${(settled / total) * 100}%` : "0%" }} /></div>
      </div>
      <p className="mt-2 text-sm text-muted">
        {counts.done} filed · {counts.failed} failed · {counts.skipped} skipped · {counts.pending + counts.processing} waiting
      </p>
      {message && <p role="alert" className="mt-3 rounded-md border border-danger px-3 py-2 text-sm text-danger">{message}</p>}

      {canExecute && (
        <div className="mt-4 flex flex-wrap gap-3">
          {working && <Button type="button" variant="secondary" onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"}</Button>}
          {working && <Button type="button" variant="danger" disabled={busy} onClick={() => { if (window.confirm("Cancel this run? Items not filed yet will be skipped. Bills already filed stay.")) void apply(cancel, reload); }}>Cancel run</Button>}
          {status !== "cancelled" && counts.failed > 0 && <Button type="button" variant="secondary" disabled={busy} onClick={() => void apply(() => retry(null), reload)}>Try all failed again</Button>}
        </div>
      )}

      <h3 className="mt-8 font-serif text-xl">{periodLabel(initial.periodKey)}</h3>
      {items.length === 0
        ? <p className="mt-3 text-sm text-muted">No emails matched your sources in this month.</p>
        : <ul className="mt-2 divide-y divide-line border-y border-line">{items.map((item) => <ItemRow key={item.id} item={item} canExecute={canExecute} onRetry={(id) => void apply(() => retry(id), reload)} />)}</ul>}
    </div>
  );
}
