import { ComposeForm } from "@/components/features/sends/compose-form";
import { Badge } from "@/components/ui/badge";
import { periodLabel } from "@/constants/runs";
import { SEND_STATUS_LABELS } from "@/constants/sends";
import { previewSendAction, startSendAction } from "@/server/http/actions/send-actions";
import { composeOptions, listSendSummaries } from "@/server/http/queries/send-queries";
import { requireOrg } from "@/server/http/session";
import { TextLink } from "@/components/features/shell/pending-link";

export const metadata = { title: "Send" };
// Starting a send builds the email; the emails themselves go out one per request from the progress page.
export const maxDuration = 60;

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function Send({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ period?: string }> }) {
  const { orgSlug } = await params;
  const { period } = await searchParams;
  const { membership, permissions } = await requireOrg(orgSlug);
  const canSend = permissions.includes("reports.send");
  const [options, sends] = await Promise.all([canSend ? composeOptions(membership.orgId) : null, listSendSummaries(membership.orgId)]);
  const initialPeriod = options && period && options.periods.includes(period) ? period : (options?.periods[0] ?? "");
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-4xl">Send</h1>
      <p className="mt-2 text-sm text-muted">Email a month&rsquo;s summary, with the bill PDFs attached, to the people on your <TextLink href={`/${orgSlug}/recipients`}>recipient list</TextLink>. Look at the preview first.</p>
      {options
        ? <div className="mt-6"><ComposeForm orgSlug={orgSlug} options={options} start={startSendAction.bind(null, orgSlug) as never} preview={previewSendAction.bind(null, orgSlug) as never} initialPeriod={initialPeriod} /></div>
        : <p className="mt-6 text-sm text-muted">You can see what has been sent below. Ask an owner or admin if you need to send a summary.</p>}
      <h2 className="mt-12 font-serif text-2xl">Sent emails</h2>
      {sends.length === 0 ? <p className="mt-3 text-sm text-muted">Nothing sent yet.</p> : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {sends.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span>
                <TextLink href={`/${orgSlug}/send/${s.id}`} className="font-medium">{periodLabel(s.periodKey)}{s.isTest ? " (test)" : ""}</TextLink>
                <span className="text-muted"> · {s.billCount} {s.billCount === 1 ? "bill" : "bills"} · {s.totalText} · {when(s.createdAt)}</span>
                <span className="block text-xs text-muted">{s.counts.sent} sent · {s.counts.failed} failed · {s.counts.skipped} skipped · {s.counts.pending + s.counts.processing} waiting · from {s.fromAccount}</span>
              </span>
              <Badge tone={s.status === "sent" ? "good" : s.status === "sent_with_errors" || s.status === "failed" ? "bad" : "neutral"}>{SEND_STATUS_LABELS[s.status] ?? s.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
