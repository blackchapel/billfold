import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SourceForm } from "@/components/features/sources/source-form";
import { saveSourceAction, testSourceAction } from "@/server/http/actions/source-actions";
import { getSource, mailboxOptions } from "@/server/http/queries/source-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Edit source" };

export default async function EditSource({ params }: { params: Promise<{ orgSlug: string; sourceId: string }> }) {
  const { orgSlug, sourceId } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  if (!permissions.includes("sources.manage")) redirect(`/${orgSlug}/sources`);
  const [source, mailboxes] = await Promise.all([getSource(membership.orgId, sourceId), mailboxOptions(membership.orgId)]);
  if (!source) notFound();
  return (
    <div>
      <p className="text-sm"><Link href={`/${orgSlug}/sources`} className="underline underline-offset-4">All sources</Link></p>
      <h1 className="mt-2 font-serif text-4xl">{source.name}</h1>
      <div className="mt-6">
        <SourceForm key={source.id} action={saveSourceAction.bind(null, orgSlug, source.id) as never} testAction={testSourceAction.bind(null, orgSlug) as never} mailboxes={mailboxes} initial={source} />
      </div>
    </div>
  );
}
