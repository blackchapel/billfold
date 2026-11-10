import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export const metadata = { title: "Not authorised" };

export default function NotAuthorised() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6">
      <Logo size={32} />
      <h1 className="font-serif text-3xl">This account is not authorised</h1>
      <p className="text-muted">
        The Google account you used has not been approved for Billfold. Ask the person who runs your Billfold to add your email address,
        then try again.
      </p>
      <Link href="/sign-in" className="underline underline-offset-4">Back to sign in</Link>
    </div>
  );
}
