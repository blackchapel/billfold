import { notFound, redirect } from "next/navigation";
import { RunConfigForm } from "@/components/features/run-configs/run-config-form";
import { saveRunConfigAction } from "@/server/http/actions/run-config-actions";
import { driveOptions, getRunConfig, sourceOptions } from "@/server/http/queries/source-queries";
import { requireOrg } from "@/server/http/session";
import { TextLink } from "@/components/features/shell/pending-link";

export const metadata = { title: "Edit run configuration" };

export default async function EditRunConfig({ params }: { params: Promise<{ orgSlug: string; runConfigId: string }> }) {
  const { orgSlug, runConfigId } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  if (!permissions.includes("run_configs.manage")) redirect(`/${orgSlug}/run-configs`);
  const [config, drives, sources] = await Promise.all([getRunConfig(membership.orgId, runConfigId), driveOptions(membership.orgId), sourceOptions(membership.orgId)]);
  if (!config) notFound();
  return (
    <div>
      <p className="text-sm"><TextLink href={`/${orgSlug}/run-configs`}>All run configurations</TextLink></p>
      <h1 className="mt-2 font-serif text-4xl">{config.name}</h1>
      <div className="mt-6"><RunConfigForm key={config.id} action={saveRunConfigAction.bind(null, orgSlug, config.id) as never} drives={drives} sources={sources} initial={config} /></div>
    </div>
  );
}
