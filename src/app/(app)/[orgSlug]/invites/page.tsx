import { InviteForm } from "@/components/features/org/invite-form";
import { Badge } from "@/components/ui/badge";
import { createInviteAction, revokeInviteAction } from "@/server/http/actions/invite-actions";
import { listInvites } from "@/server/http/queries/org-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Invites" };

export default async function Invites({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  const canManage = permissions.includes("invites.manage");
  const invites = canManage ? await listInvites(membership.orgId) : [];
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-4xl">Invites</h1>
      {!canManage ? <p className="mt-4 text-muted">You do not have permission to manage invites.</p> : (
        <>
          <div className="mt-6"><InviteForm action={createInviteAction.bind(null, orgSlug)} /></div>
          <h2 className="mt-10 font-serif text-2xl">Existing invites</h2>
          {invites.length === 0 ? <p className="mt-3 text-sm text-muted">No invites yet.</p> : (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {invites.map((i) => {
                const state = i.state;
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <span>{i.role} · {i.useCount}/{i.maxUses} used · expires {i.expiresAt.toLocaleDateString("en-IN")}</span>
                    <span className="flex items-center gap-3">
                      <Badge tone={state === "active" ? "good" : "neutral"}>{state}</Badge>
                      {state === "active" && <form action={revokeInviteAction.bind(null, orgSlug, i.id)}><button className="text-danger underline underline-offset-4">Revoke</button></form>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
