import { StartRunForm } from "@/components/features/runs/start-run-form";
import { Badge } from "@/components/ui/badge";
import { RUN_STATUS_LABELS, periodLabel } from "@/constants/runs";
import { startRunAction } from "@/server/http/actions/run-actions";
import { listRuns, startRunOptions } from "@/server/http/queries/run-queries";
import { requireOrg } from "@/server/http/session";
import { TextLink } from "@/components/features/shell/pending-link";

export const metadata = { title: "Runs" };
// Starting a run searches every source's mailbox, which can take a while on a big mailbox.
export const maxDuration = 60;

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function Runs({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  const canRun = permissions.includes("runs.execute");
  const [runs, options] = await Promise.all([listRuns(membership.orgId), startRunOptions(membership.orgId)]);
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-4xl">Runs</h1>
      <p className="mt-2 text-sm text-muted">A run collects one month of bills: it finds the emails, opens the PDFs, reads the amounts and files each PDF in Google Drive.</p>
      {canRun && (
        <section className="mt-6">
          {options.configs.length > 0
            ? <StartRunForm action={startRunAction.bind(null, orgSlug) as never} options={options} />
            : <p className="text-sm text-muted">To start a run you need a run configuration with at least one source. Set them up on the <TextLink href={`/${orgSlug}/run-configs`}>Run configs</TextLink> page.</p>}
        </section>
      )}
      <h2 className="mt-10 font-serif text-2xl">Recent runs</h2>
      {runs.length === 0 ? <p className="mt-3 text-sm text-muted">No runs yet.</p> : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {runs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span>
                <TextLink href={`/${orgSlug}/runs/${r.id}`} className="font-medium">{periodLabel(r.periodKey)}</TextLink>
                <span className="text-muted"> · {r.configName} · started {when(r.createdAt)}</span>
                <span className="block text-xs text-muted">{r.counts.done} filed · {r.counts.failed} failed · {r.counts.skipped} skipped · {r.counts.pending + r.counts.processing} waiting</span>
              </span>
              <Badge tone={r.status === "completed" ? "good" : r.status === "completed_with_errors" ? "bad" : "neutral"}>{RUN_STATUS_LABELS[r.status] ?? r.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
