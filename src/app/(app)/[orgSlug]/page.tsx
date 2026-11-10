import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { RUN_STATUS_LABELS, periodLabel } from "@/constants/runs";
import { needsReviewCount } from "@/server/http/queries/bill-queries";
import { listConnections } from "@/server/http/queries/connection-queries";
import { listSendSummaries } from "@/server/http/queries/send-queries";
import { listRuns } from "@/server/http/queries/run-queries";
import { listRunConfigs, listSources } from "@/server/http/queries/source-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Overview" };

export default async function Overview({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership } = await requireOrg(orgSlug);
  const orgId = membership.orgId;
  const [connections, sources, configs, runs, toCheck, sends] = await Promise.all([listConnections(orgId), listSources(orgId), listRunConfigs(orgId), listRuns(orgId, 1), needsReviewCount(orgId), listSendSummaries(orgId)]);
  const broken = connections.filter((c) => c.status !== "active");
  const steps = [
    { done: connections.some((c) => c.kind === "gmail" || c.kind === "imap") && connections.some((c) => c.kind === "google_drive"), href: "/connections", title: "Connect a mailbox and a Google Drive", hint: "Where bills come from, and where the PDFs are filed." },
    { done: sources.length > 0, href: "/sources", title: "Describe your bills as sources", hint: "Who sends them and how the PDF is locked. Use the test button to check." },
    { done: configs.length > 0, href: "/run-configs", title: "Create a run configuration", hint: "Which sources to collect, and the Drive folder to file them in." },
    { done: runs.length > 0, href: "/runs", title: "Start your first run", hint: "Collect a month of bills and file them." },
    { done: sends.some((s) => !s.isTest), href: "/send", title: "Send your first summary", hint: "Add recipients, look at the preview and email the month with the PDFs attached." },
  ];
  const next = steps.find((s) => !s.done);
  const last = runs[0];
  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-4xl">{membership.org.name}</h1>
      <p className="mt-2 text-sm text-muted">Your role: <span className="font-medium text-ink">{membership.role}</span></p>
      {broken.length > 0 && (
        <div role="alert" className="mt-6 rounded-md border border-danger px-4 py-3 text-sm">
          <p className="font-medium text-danger">{broken.length === 1 ? "A connection needs attention" : `${broken.length} connections need attention`}</p>
          <p className="mt-1 text-muted">{broken.map((c) => c.label).join(", ")} can no longer sign in. <Link href={`/${orgSlug}/connections`} className="underline underline-offset-4">Open Connections</Link> to reconnect.</p>
        </div>
      )}
      {toCheck > 0 && (
        <p className="mt-6 rounded-md border border-warn px-4 py-3 text-sm" aria-label="Bills to check">
          <span className="font-medium">{toCheck} {toCheck === 1 ? "bill needs" : "bills need"} a check.</span>{" "}
          <Link href={`/${orgSlug}/bills?filter=review`} className="underline underline-offset-4">Review {toCheck === 1 ? "it" : "them"}</Link>
        </p>
      )}
      {last && (
        <section className="mt-8 rounded-md border border-line p-5" aria-label="Latest run">
          <h2 className="font-serif text-xl">Latest run</h2>
          <p className="mt-2 text-sm">
            <Link href={`/${orgSlug}/runs/${last.id}`} className="font-medium underline underline-offset-4">{periodLabel(last.periodKey)}</Link>
            <span className="text-muted"> · {last.configName} · </span><Badge tone={last.status === "completed" ? "good" : last.status === "completed_with_errors" ? "bad" : "neutral"}>{RUN_STATUS_LABELS[last.status] ?? last.status}</Badge>
          </p>
          <p className="mt-1 text-sm text-muted">{last.counts.done} filed · {last.counts.failed} failed · {last.counts.skipped} skipped · {last.counts.pending + last.counts.processing} waiting</p>
        </section>
      )}
      <section className="mt-8" aria-label="Getting started">
        <h2 className="font-serif text-xl">{next ? "Getting started" : "Everything is set up"}</h2>
        <ol className="mt-3 divide-y divide-line border-y border-line">
          {steps.map((s, i) => (
            <li key={s.href} className="flex items-start justify-between gap-3 py-3 text-sm">
              <span>
                <Link href={`/${orgSlug}${s.href}`} className="font-medium underline underline-offset-4">{i + 1}. {s.title}</Link>
                <span className="block text-xs text-muted">{s.hint}</span>
              </span>
              <Badge tone={s.done ? "good" : "neutral"}>{s.done ? "done" : "to do"}</Badge>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted">To let other people in, create a code on the <Link href={`/${orgSlug}/invites`} className="underline underline-offset-4">Invites</Link> page.</p>
      </section>
    </div>
  );
}
