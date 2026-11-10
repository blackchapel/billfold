import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { currentUser } from "@/server/http/session";
import { landingPathFor } from "@/server/http/queries/org-queries";

export default async function Home() {
  const user = await currentUser();
  if (user) redirect(await landingPathFor(user.id));
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-10">
      <header className="flex items-center justify-between"><Logo /><Link href="/sign-in" className="text-sm underline underline-offset-4">Sign in</Link></header>
      <main className="my-auto py-16">
        <h1 className="font-serif text-5xl leading-tight tracking-tight">Every bill, filed and summarised.</h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          Billfold gathers your recurring bills from email, unlocks the PDFs, reads the amounts, files them neatly in Google Drive and
          sends one clear summary to the people who need it.
        </p>
        <Link href="/sign-in" className="mt-8 inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-ink">Sign in with Google</Link>
      </main>
      <footer className="flex gap-4 text-sm text-muted"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></footer>
    </div>
  );
}
