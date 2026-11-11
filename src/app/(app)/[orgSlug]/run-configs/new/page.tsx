import { redirect } from "next/navigation";
import { RunConfigForm } from "@/components/features/run-configs/run-config-form";
import { saveRunConfigAction } from "@/server/http/actions/run-config-actions";
import { driveOptions, sourceOptions } from "@/server/http/queries/source-queries";
import { requireOrg } from "@/server/http/session";
import { TextLink } from "@/components/features/shell/pending-link";

export const metadata = { title: "New run configuration" };

export default async function NewRunConfig({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  if (!permissions.includes("run_configs.manage")) redirect(`/${orgSlug}/run-configs`);
  const [drives, sources] = await Promise.all([driveOptions(membership.orgId), sourceOptions(membership.orgId)]);
  return (
    <div>
      <p className="text-sm"><TextLink href={`/${orgSlug}/run-configs`}>All run configurations</TextLink></p>
      <h1 className="mt-2 font-serif text-4xl">New run configuration</h1>
      <div className="mt-6"><RunConfigForm action={saveRunConfigAction.bind(null, orgSlug, null) as never} drives={drives} sources={sources} /></div>
    </div>
  );
}
