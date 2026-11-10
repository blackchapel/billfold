"use client";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SEND_ITEM_STATUS_LABELS, SEND_STATUS_LABELS } from "@/constants/sends";
import type { ActionState } from "@/types/action";
import type { SendCountsDto, SendDetailDto, SendItemDto, SendStepDto } from "@/types/send";

interface Props {
  initial: SendDetailDto;
  canSend: boolean;
  processNext: () => Promise<ActionState<SendStepDto>>;
  cancel: () => Promise<ActionState>;
  retry: (itemId: string | null) => Promise<ActionState<number>>;
}

const tone = (s: string) => (s === "sent" ? "good" : s === "failed" ? "bad" : s === "processing" ? "warn" : "neutral") as "good" | "bad" | "warn" | "neutral";
const settledOf = (c: SendCountsDto) => c.sent + c.failed + c.skipped;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

export function SendProgress({ initial, canSend, processNext, cancel, retry }: Props) {
  const [items, setItems] = useState(initial.items);
  const [counts, setCounts] = useState(initial.counts);
  const [status, setStatus] = useState(initial.status);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const furthest = useRef(settledOf(initial.counts));

  const total = counts.pending + counts.processing + counts.sent + counts.failed + counts.skipped;
  const settled = settledOf(counts);
  const working = status === "sending" && counts.pending + counts.processing > 0;

  // One email per request, so a slow mail server or a bad address only ever affects that one email.
  useEffect(() => {
    if (!canSend || paused || !working) return;
    let stop = false;
    void (async () => {
      while (!stop) {
        const res = await processNext();
        if (!res.ok) { if (!stop) { setMessage(res.message); setPaused(true); } return; }
        const { item, counts: next, status: nextStatus, finished } = res.data;
        if (settledOf(next) >= furthest.current) { furthest.current = settledOf(next); setCounts(next); setStatus(nextStatus); }
        if (item) setItems((list) => list.map((x) => (x.id === item.id ? item : x)));
        if (finished || stop) return;
        if (!item) await sleep(3000);
      }
    })();
    return () => { stop = true; };
  }, [canSend, paused, working, processNext]);

  const apply = async (task: () => Promise<ActionState<unknown>>) => {
    setBusy(true);
    setMessage(null);
    const res = await task();
    setBusy(false);
    if (!res.ok) { setMessage(res.message); return; }
    window.location.reload();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif text-2xl" data-testid="send-status">{SEND_STATUS_LABELS[status] ?? status}</h2>
        {working && !paused && <span className="text-sm text-muted" role="status">Sending, please keep this page open…</span>}
        {working && paused && <span className="text-sm text-muted">Paused</span>}
      </div>
      <div className="mt-3" role="progressbar" aria-label="Sending progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={settled}>
        <div className="h-2 rounded-sm bg-surface"><div className="h-2 rounded-sm bg-accent" style={{ width: total ? `${(settled / total) * 100}%` : "0%" }} /></div>
      </div>
      <p className="mt-2 text-sm text-muted">{counts.sent} sent · {counts.failed} failed · {counts.skipped} skipped · {counts.pending + counts.processing} waiting</p>
      {message && <p role="alert" className="mt-3 rounded-md border border-danger px-3 py-2 text-sm text-danger">{message}</p>}
      {canSend && (
        <div className="mt-4 flex flex-wrap gap-3">
          {working && <Button type="button" variant="secondary" onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"}</Button>}
          {working && <Button type="button" variant="danger" disabled={busy} onClick={() => { if (window.confirm("Cancel this send? Emails not sent yet will be skipped. Emails already sent cannot be taken back.")) void apply(cancel); }}>Cancel send</Button>}
          {status !== "cancelled" && counts.failed > 0 && <Button type="button" variant="secondary" disabled={busy} onClick={() => void apply(() => retry(null))}>Try all failed again</Button>}
        </div>
      )}
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {items.map((i: SendItemDto) => (
          <li key={i.id} data-status={i.status} data-recipient={i.recipientEmail} className="flex flex-col gap-1 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><span className="font-medium">{i.recipientName}</span><span className="text-muted"> · {i.recipientEmail}</span></span>
              <Badge tone={tone(i.status)}>{SEND_ITEM_STATUS_LABELS[i.status] ?? i.status}</Badge>
            </div>
            {i.sentAt && <p className="text-xs text-muted">Sent at {time(i.sentAt)}</p>}
            {i.error && <p className={`text-xs ${i.status === "failed" ? "text-danger" : "text-muted"}`}>{i.error}</p>}
            {canSend && i.canRetry && <p><button type="button" disabled={busy} onClick={() => void apply(() => retry(i.id))} className="text-xs underline underline-offset-4">Try again</button></p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
