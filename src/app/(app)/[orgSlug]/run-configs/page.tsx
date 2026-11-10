import Link from "next/link";
import { ConfirmDelete } from "@/components/features/shared/confirm-delete";
import { PERIOD_MODE_LABELS } from "@/constants/sources";
import { deleteRunConfigAction } from "@/server/http/actions/run-config-actions";
import { driveOptions, listRunConfigs, sourceOptions } from "@/server/http/queries/source-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Run configurations" };

const button = "inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90";

export default async function RunConfigs({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  const canManage = permissions.includes("run_configs.manage");
  const [configs, drives, sources] = await Promise.all([listRunConfigs(membership.orgId), driveOptions(membership.orgId), sourceOptions(membership.orgId)]);
  const missing = drives.length === 0 ? "a Google Drive on the Connections page" : sources.length === 0 ? "at least one source on the Sources page" : null;
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-4xl">Run configurations</h1>
      <p className="mt-2 text-sm text-muted">A run configuration says which sources to collect and which Google Drive to file the PDFs in. Runs themselves arrive in the next phase.</p>
      {canManage && (missing
        ? <p className="mt-4 text-sm text-muted">Before you can add one, set up {missing}.</p>
        : <p className="mt-4"><Link href={`/${orgSlug}/run-configs/new`} className={button}>New run configuration</Link></p>)}
      {configs.length === 0 ? <p className="mt-8 text-sm text-muted">No run configurations yet.</p> : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {configs.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 py-3 text-sm">
              <p><span className="font-medium">{c.name}</span><span className="text-muted"> · {PERIOD_MODE_LABELS[c.periodMode]}</span></p>
              <p className="text-xs text-muted">Files into “{c.driveFolder}” on {c.driveLabel}</p>
              <p className="text-xs text-muted">Sources: {c.sourceNames.length > 0 ? c.sourceNames.join(", ") : "none left. Edit this to add one"}</p>
              {canManage && (
                <div className="flex flex-wrap items-center gap-4">
                  <Link href={`/${orgSlug}/run-configs/${c.id}`} className="underline underline-offset-4">Edit</Link>
                  <ConfirmDelete action={deleteRunConfigAction.bind(null, orgSlug, c.id) as never} name={c.name} warning="Past results stay; the configuration is forgotten." />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
