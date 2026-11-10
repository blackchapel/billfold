import Link from "next/link";
import { Logo } from "@/components/ui/logo";

/** Plain public frame for the privacy policy and the terms: no sign-in needed, readable on a phone. */
export function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" aria-label="Billfold home"><Logo /></Link>
        <Link href="/sign-in" className="text-sm underline underline-offset-4">Sign in</Link>
      </header>
      <main className="py-12">
        <h1 className="font-serif text-4xl tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        <div className="mt-8 flex flex-col gap-4 text-[15px] leading-7">{children}</div>
      </main>
      <footer className="mt-auto flex gap-4 border-t border-line pt-6 text-sm text-muted">
        <Link href="/privacy" className="underline underline-offset-4">Privacy</Link>
        <Link href="/terms" className="underline underline-offset-4">Terms</Link>
        <Link href="/" className="underline underline-offset-4">Home</Link>
      </footer>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="mt-6 font-serif text-2xl">{title}</h2>
      {children}
    </section>
  );
}

/** How to reach whoever runs this copy of Billfold: the configured address, or the person who invited you. */
export function ContactLine({ email }: { email: string | null }) {
  return email
    ? <p>Write to <a href={`mailto:${email}`} className="underline underline-offset-4">{email}</a>.</p>
    : <p>Billfold is run privately. Ask the person who invited you; they can answer questions and act on your requests.</p>;
}
