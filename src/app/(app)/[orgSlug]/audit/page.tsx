import { listAudit } from "@/server/http/queries/org-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Audit log" };

export default async function Audit({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  if (!permissions.includes("audit.view")) return <div><h1 className="font-serif text-4xl">Audit log</h1><p className="mt-4 text-muted">You do not have permission to view the audit log.</p></div>;
  const entries = await listAudit(membership.orgId);
  return (
    <div>
      <h1 className="font-serif text-4xl">Audit log</h1>
      <div className="mt-6 overflow-x-auto" tabIndex={0} role="region" aria-label="Audit log entries">
        <table className="w-full min-w-[32rem] text-sm">
          <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-4 font-medium">When</th><th className="py-2 pr-4 font-medium">Action</th><th className="py-2 font-medium">Item</th></tr></thead>
          <tbody>{entries.map((e) => (
            <tr key={e.id} className="border-b border-line"><td className="py-2 pr-4 whitespace-nowrap">{e.createdAt.toLocaleString("en-IN")}</td><td className="py-2 pr-4 font-mono text-xs">{e.action}</td><td className="py-2 font-mono text-xs text-muted">{e.entityType}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
