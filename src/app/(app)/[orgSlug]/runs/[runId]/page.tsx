import Link from "next/link";
import { notFound } from "next/navigation";
import { RunProgress } from "@/components/features/runs/run-progress";
import { periodLabel } from "@/constants/runs";
import { cancelRunAction, processNextAction, retryRunAction } from "@/server/http/actions/run-actions";
import { getRun } from "@/server/http/queries/run-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Run" };
// Each filing step is one server action call from this page; this is the time limit that applies to it.
export const maxDuration = 60;

export default async function RunPage({ params }: { params: Promise<{ orgSlug: string; runId: string }> }) {
  const { orgSlug, runId } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  const run = await getRun(membership.orgId, runId);
  if (!run) notFound();
  return (
    <div className="max-w-3xl">
      <p className="text-sm"><Link href={`/${orgSlug}/runs`} className="underline underline-offset-4">All runs</Link></p>
      <h1 className="mt-2 font-serif text-4xl">{periodLabel(run.periodKey)}</h1>
      <p className="mt-1 text-sm text-muted">{run.configName}</p>
      <div className="mt-6">
        <RunProgress key={run.id} initial={run} canExecute={permissions.includes("runs.execute")}
          processNext={processNextAction.bind(null, orgSlug, run.id) as never} cancel={cancelRunAction.bind(null, orgSlug, run.id) as never}
          retry={retryRunAction.bind(null, orgSlug, run.id) as never} />
      </div>
    </div>
  );
}
