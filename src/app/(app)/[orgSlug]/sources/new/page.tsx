import { redirect } from "next/navigation";
import { SourceForm } from "@/components/features/sources/source-form";
import { saveSourceAction, testSourceAction } from "@/server/http/actions/source-actions";
import { mailboxOptions } from "@/server/http/queries/source-queries";
import { requireOrg } from "@/server/http/session";
import { TextLink } from "@/components/features/shell/pending-link";

export const metadata = { title: "New source" };

export default async function NewSource({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  if (!permissions.includes("sources.manage")) redirect(`/${orgSlug}/sources`);
  const mailboxes = await mailboxOptions(membership.orgId);
  return (
    <div>
      <p className="text-sm"><TextLink href={`/${orgSlug}/sources`}>All sources</TextLink></p>
      <h1 className="mt-2 font-serif text-4xl">New source</h1>
      <div className="mt-6">
        <SourceForm action={saveSourceAction.bind(null, orgSlug, null) as never} testAction={testSourceAction.bind(null, orgSlug) as never} mailboxes={mailboxes} />
      </div>
    </div>
  );
}
