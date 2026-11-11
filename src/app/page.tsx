import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { currentUser } from "@/server/http/session";
import { landingPathFor } from "@/server/http/queries/org-queries";

export const metadata = { title: { absolute: "Billfold: every bill, filed and summarised" } };

const STEPS = [
  { title: "Describe your bills once", text: "Say who sends each bill, what the subject looks like and how its PDF is locked. A test button shows what would be found, before anything is saved." },
  { title: "Collect a month at a time", text: "Press Run. Billfold finds the emails, opens locked PDFs, reads the amounts and files each PDF in your Google Drive, one at a time while you watch." },
  { title: "Check what it was unsure about", text: "Scans and odd layouts are flagged instead of guessed. Correct them, mark bills paid and see the month against the last twelve." },
  { title: "Send one clear summary", text: "Preview the email, send yourself a test, then send it to the people who need it, with the bill PDFs attached." },
] as const;

export default async function Home() {
  const user = await currentUser();
  if (user) redirect(await landingPathFor(user.id));
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-10">
      <header className="flex items-center justify-between"><Logo /><Link href="/sign-in" className="text-sm underline underline-offset-4">Sign in</Link></header>
      <main className="py-16">
        <h1 className="font-serif text-5xl leading-tight tracking-tight">Every bill, filed and summarised.</h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          Billfold gathers your recurring bills from email, unlocks the PDFs, reads the amounts, files them neatly in Google Drive and
          sends one clear summary to the people who need it.
        </p>
        <p className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/sign-in" className="inline-flex min-h-11 items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-ink">Sign in with Google</Link>
          <span className="text-sm text-muted">Invite-only, for families and small teams.</span>
        </p>

        <section aria-label="How it works" className="mt-20">
          <h2 className="font-serif text-3xl">How it works</h2>
          <ol className="mt-6 divide-y divide-line border-y border-line">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-x-2 py-5">
                <span className="font-serif text-2xl text-accent" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3 className="font-medium">{s.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="Your data stays yours" className="mt-16">
          <h2 className="font-serif text-3xl">Your data stays yours</h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted">
            The PDFs live in your own Google Drive, and Billfold can only see the files it creates there. It reads only the emails that match what you described,
            never changes your mailbox, and sends email only when a person presses Send. Saved passwords are encrypted. There are no ads and no tracking.
            Read the <Link href="/privacy" className="underline underline-offset-4">privacy page</Link> for the details.
          </p>
        </section>
      </main>
      <footer className="mt-auto flex gap-4 border-t border-line pt-6 text-sm text-muted">
        <Link href="/privacy" className="underline underline-offset-4">Privacy</Link>
        <Link href="/terms" className="underline underline-offset-4">Terms</Link>
      </footer>
    </div>
  );
}
