import { ClearCacheForm, DeleteForm, RenameForm, TransferForm } from "@/components/features/org/org-admin-forms";
import { clearCacheAction, deleteOrgAction, renameOrgAction, transferOwnershipAction } from "@/server/http/actions/org-actions";
import { listMembers } from "@/server/http/queries/org-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Settings" };

export default async function Settings({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { user, membership, permissions } = await requireOrg(orgSlug);
  const canManage = permissions.includes("org.manage");
  const canTransfer = permissions.includes("org.transfer");
  const canDelete = permissions.includes("org.delete");
  const candidates = canTransfer
    ? (await listMembers(membership.orgId)).filter((m) => m.userId !== user.id).map((m) => ({ id: m.userId, label: m.name ? `${m.name} (${m.email})` : m.email }))
    : [];
  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-4xl">Settings</h1>
      <dl className="mt-6 grid grid-cols-[10rem_1fr] gap-y-3 text-sm">
        <dt className="text-muted">Name</dt><dd>{membership.org.name}</dd>
        <dt className="text-muted">Address</dt><dd className="font-mono">/{membership.org.slug}</dd>
        <dt className="text-muted">Currency</dt><dd>{membership.org.defaultCurrency}</dd>
      </dl>
      {canManage && (
        <section className="mt-10 border-t border-line pt-6">
          <h2 className="font-serif text-2xl">Rename</h2>
          <p className="mb-4 mt-1 text-sm text-muted">The address stays the same so existing links keep working.</p>
          <RenameForm action={renameOrgAction.bind(null, orgSlug) as never} name={membership.org.name} />
        </section>
      )}
      {canManage && (
        <section className="mt-10 border-t border-line pt-6">
          <h2 className="font-serif text-2xl">Cache</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Billfold remembers lists and reports for a few minutes so pages open quickly, and forgets them the moment something changes. If a screen ever looks out of date, clear it here.</p>
          <ClearCacheForm action={clearCacheAction.bind(null, orgSlug) as never} />
        </section>
      )}
      {canTransfer && (
        <section className="mt-10 border-t border-line pt-6">
          <h2 className="font-serif text-2xl">Transfer ownership</h2>
          <div className="mt-4"><TransferForm action={transferOwnershipAction.bind(null, orgSlug) as never} candidates={candidates} /></div>
        </section>
      )}
      {canDelete && (
        <section className="mt-10 border-t border-line pt-6">
          <h2 className="font-serif text-2xl text-danger">Delete organisation</h2>
          <div className="mt-4"><DeleteForm action={deleteOrgAction.bind(null, orgSlug) as never} slug={membership.org.slug} /></div>
        </section>
      )}
    </div>
  );
}
