import Link from "next/link";
import { listConnections } from "@/server/http/queries/connection-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Overview" };

export default async function Overview({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership } = await requireOrg(orgSlug);
  const broken = (await listConnections(membership.orgId)).filter((c) => c.status !== "active");
  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-4xl">{membership.org.name}</h1>
      <p className="mt-2 text-sm text-muted">Your role: <span className="font-medium text-ink">{membership.role}</span></p>
      {broken.length > 0 && (
        <div role="alert" className="mt-6 rounded-md border border-danger px-4 py-3 text-sm">
          <p className="font-medium text-danger">{broken.length === 1 ? "A connection needs attention" : `${broken.length} connections need attention`}</p>
          <p className="mt-1 text-muted">{broken.map((c) => c.label).join(", ")} can no longer sign in. <Link href={`/${orgSlug}/connections`} className="underline underline-offset-4">Open Connections</Link> to reconnect.</p>
        </div>
      )}
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
