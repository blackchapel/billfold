import { OverridesForm, RoleForm } from "@/components/features/org/member-controls";
import { Badge } from "@/components/ui/badge";
import { changeRoleAction, removeMemberAction, setOverridesAction } from "@/server/http/actions/member-actions";
import { listMembers } from "@/server/http/queries/org-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Members" };

export default async function Members({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { user, membership, permissions } = await requireOrg(orgSlug);
  const members = await listMembers(membership.orgId);
  const canManage = permissions.includes("members.manage");
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-4xl">Members</h1>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {members.map((m) => (
          <li key={m.userId} className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-medium">{m.name ?? m.email}</p><p className="text-sm text-muted">{m.email}</p></div>
              <div className="flex items-center gap-3">
                <Badge tone={m.role === "owner" ? "good" : "neutral"}>{m.role}</Badge>
                {canManage && <RoleForm action={changeRoleAction.bind(null, orgSlug, m.userId)} role={m.role} disabled={false} />}
                {(canManage || m.userId === user.id) && (
                  <form action={removeMemberAction.bind(null, orgSlug, m.userId)}><button className="text-sm text-danger underline underline-offset-4">{m.userId === user.id ? "Leave" : "Remove"}</button></form>
                )}
              </div>
            </div>
            {canManage && m.role !== "owner" && (
              <details className="mt-2"><summary className="cursor-pointer text-sm text-muted">Permission overrides</summary>
                <OverridesForm action={setOverridesAction.bind(null, orgSlug, m.userId)} overrides={m.overrides as Record<string, boolean>} disabled={false} />
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
