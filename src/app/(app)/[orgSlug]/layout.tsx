import { after } from "next/server";
import { AppShell } from "@/components/features/shell/app-shell";
import { signOut } from "@/server/http/actions/auth-actions";
import { markActiveOrg } from "@/server/http/queries/org-queries";
import { requireOrg } from "@/server/http/session";

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { user, membership, memberships } = await requireOrg(orgSlug);
  // Remembering the last org is bookkeeping: do it after the response so it never delays a tab switch.
  after(() => markActiveOrg(user.id, membership.orgId));
  const orgs = memberships.map((m) => ({ id: m.org.id, name: m.org.name, slug: m.org.slug, role: m.role }));
  const active = orgs.find((o) => o.id === membership.orgId) ?? { id: membership.orgId, name: membership.org.name, slug: orgSlug, role: membership.role };
  return <AppShell user={user} orgs={orgs} active={active} signOut={signOut}>{children}</AppShell>;
}
