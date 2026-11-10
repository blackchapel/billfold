import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RecipientForm } from "@/components/features/recipients/recipient-form";
import { saveRecipientAction } from "@/server/http/actions/recipient-actions";
import { listRecipientDtos } from "@/server/http/queries/send-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Edit recipient" };

export default async function EditRecipient({ params }: { params: Promise<{ orgSlug: string; recipientId: string }> }) {
  const { orgSlug, recipientId } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  if (!permissions.includes("recipients.manage")) redirect(`/${orgSlug}/recipients`);
  const recipient = (await listRecipientDtos(membership.orgId)).find((r) => r.id === recipientId);
  if (!recipient) notFound();
  return (
    <div>
      <p className="text-sm"><Link href={`/${orgSlug}/recipients`} className="underline underline-offset-4">All recipients</Link></p>
      <h1 className="mt-2 font-serif text-4xl">{recipient.name}</h1>
      <div className="mt-6"><RecipientForm key={recipient.id} action={saveRecipientAction.bind(null, orgSlug, recipient.id) as never} recipient={recipient} cancelHref={`/${orgSlug}/recipients`} /></div>
    </div>
  );
}
