import { notFound } from "next/navigation";
import Link from "next/link";
import { AllowlistForm } from "@/components/features/admin/allowlist-form";
import { Logo } from "@/components/ui/logo";
import { addAllowlistAction, removeAllowlistAction } from "@/server/http/actions/allowlist-actions";
import { adminOverview } from "@/server/http/queries/org-queries";
import { requireUser } from "@/server/http/session";

export const metadata = { title: "Platform admin" };

export default async function AdminPage() {
  const user = await requireUser();
  if (!user.isSuperAdmin) notFound();
  const { allowlist, users, orgs } = await adminOverview();
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between"><Logo /><Link href="/" className="text-sm underline underline-offset-4">Back to app</Link></div>
      <h1 className="mt-8 font-serif text-4xl">Platform admin</h1>
      <section className="mt-8" aria-labelledby="allow"><h2 id="allow" className="font-serif text-2xl">Who can sign in</h2>
        <p className="mt-1 text-sm text-muted">Only these Google accounts (and the super admins) can sign in, even with a valid invite code.</p>
        <div className="mt-4"><AllowlistForm action={addAllowlistAction} /></div>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {allowlist.length === 0 && <li className="py-3 text-sm text-muted">No emails yet.</li>}
          {allowlist.map((a) => (
            <li key={a.email} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span>{a.email}{a.note && <span className="ml-2 text-muted">· {a.note}</span>}</span>
              <form action={removeAllowlistAction.bind(null, a.email)}><button className="text-danger underline underline-offset-4">Remove</button></form>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div><h2 className="font-serif text-2xl">Users ({users.length})</h2><ul className="mt-3 text-sm">{users.map((u) => <li key={u.id} className="border-b border-line py-2">{u.email}</li>)}</ul></div>
        <div><h2 className="font-serif text-2xl">Organisations ({orgs.length})</h2><ul className="mt-3 text-sm">{orgs.map((o) => <li key={o.id} className="border-b border-line py-2">{o.name} <span className="font-mono text-xs text-muted">/{o.slug}</span></li>)}</ul></div>
      </section>
    </div>
  );
}
