import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Overview" };

export default async function Overview({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership } = await requireOrg(orgSlug);
  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-4xl">{membership.org.name}</h1>
      <p className="mt-2 text-sm text-muted">Your role: <span className="font-medium text-ink">{membership.role}</span></p>
      <div className="mt-8 rounded-md border border-dashed border-line p-6">
        <h2 className="font-serif text-xl">No bills yet</h2>
        <p className="mt-2 text-sm text-muted">
          Next you will connect a mailbox and a Google Drive, then describe the bills you receive. Those steps arrive in the next phases.
          For now you can invite people from the Invites page.
        </p>
      </div>
    </div>
  );
}
