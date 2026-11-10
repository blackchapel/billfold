import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Settings" };

export default async function Settings({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership } = await requireOrg(orgSlug);
  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-4xl">Settings</h1>
      <dl className="mt-6 grid grid-cols-[10rem_1fr] gap-y-3 text-sm">
        <dt className="text-muted">Name</dt><dd>{membership.org.name}</dd>
        <dt className="text-muted">Address</dt><dd className="font-mono">/{membership.org.slug}</dd>
        <dt className="text-muted">Currency</dt><dd>{membership.org.defaultCurrency}</dd>
      </dl>
      <p className="mt-8 text-sm text-muted">Renaming, ownership transfer and deleting the organisation arrive with the later phases.</p>
    </div>
  );
}
