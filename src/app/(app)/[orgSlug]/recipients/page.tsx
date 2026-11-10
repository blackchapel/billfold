import Link from "next/link";
import { RecipientForm } from "@/components/features/recipients/recipient-form";
import { ConfirmDelete } from "@/components/features/shared/confirm-delete";
import { deleteRecipientAction, saveRecipientAction } from "@/server/http/actions/recipient-actions";
import { listRecipientDtos } from "@/server/http/queries/send-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Recipients" };

export default async function Recipients({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  const canManage = permissions.includes("recipients.manage");
  const recipients = await listRecipientDtos(membership.orgId);
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-4xl">Recipients</h1>
      <p className="mt-2 text-sm text-muted">The people who can receive a monthly summary. Pick who gets each one on the <Link href={`/${orgSlug}/send`} className="underline underline-offset-4">Send</Link> page.</p>
      {canManage && (
        <section className="mt-6" aria-label="Add a recipient">
          <h2 className="font-serif text-2xl">Add a recipient</h2>
          <div className="mt-3"><RecipientForm action={saveRecipientAction.bind(null, orgSlug, null) as never} /></div>
        </section>
      )}
      <h2 className="mt-10 font-serif text-2xl">Everyone on the list</h2>
      {recipients.length === 0 ? <p className="mt-3 text-sm text-muted">Nobody yet.</p> : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {recipients.map((r) => (
            <li key={r.id} data-recipient={r.email} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <span><span className="font-medium">{r.name}</span><span className="text-muted"> · {r.email}</span></span>
              {canManage && (
                <span className="flex items-center gap-4">
                  <Link href={`/${orgSlug}/recipients/${r.id}`} className="underline underline-offset-4">Edit</Link>
                  <ConfirmDelete action={deleteRecipientAction.bind(null, orgSlug, r.id) as never} name={r.name} warning="Emails already sent to them stay in the sent log." />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
