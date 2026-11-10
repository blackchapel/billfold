import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import type { OrgSummaryDto, SessionUser } from "@/types/auth";

const NAV = [
  { href: "", label: "Overview" },
  { href: "/members", label: "Members" },
  { href: "/connections", label: "Connections" },
  { href: "/invites", label: "Invites" },
  { href: "/audit", label: "Audit log" },
  { href: "/settings", label: "Settings" },
];

interface Props {
  user: SessionUser;
  orgs: OrgSummaryDto[];
  active: OrgSummaryDto;
  signOut: () => Promise<void>;
  children: React.ReactNode;
}

export function AppShell({ user, orgs, active, signOut, children }: Props) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-line p-4 md:border-r md:border-b-0">
        <Link href={`/${active.slug}`} aria-label="Billfold home"><Logo /></Link>
        <nav aria-label="Main" className="mt-4 flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map((item) => (
            <Link key={item.href} href={`/${active.slug}${item.href}`} className="rounded-md px-3 py-2 text-sm whitespace-nowrap hover:bg-surface">{item.label}</Link>
          ))}
          {user.isSuperAdmin && <Link href="/admin" className="rounded-md px-3 py-2 text-sm whitespace-nowrap hover:bg-surface">Platform admin</Link>}
        </nav>
        <div className="mt-6 hidden text-xs text-muted md:block">
          <p className="mb-1 uppercase tracking-wide">Organisations</p>
          <ul className="flex flex-col gap-1">
            {orgs.map((o) => (
              <li key={o.id}><Link href={`/${o.slug}`} aria-current={o.id === active.id ? "page" : undefined} className={`block rounded-md px-3 py-1.5 hover:bg-surface ${o.id === active.id ? "font-semibold text-ink" : ""}`}>{o.name}</Link></li>
            ))}
            <li><Link href="/onboarding" className="block rounded-md px-3 py-1.5 hover:bg-surface">+ New or join</Link></li>
          </ul>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-8">
          <details className="md:hidden">
            <summary className="cursor-pointer text-sm">{active.name}</summary>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {orgs.map((o) => <li key={o.id}><Link href={`/${o.slug}`}>{o.name}</Link></li>)}
              <li><Link href="/onboarding">+ New or join</Link></li>
            </ul>
          </details>
          <p className="hidden font-serif text-lg md:block">{active.name}</p>
          <form action={signOut} className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{user.email}</span>
            <button className="underline underline-offset-4">Sign out</button>
          </form>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
