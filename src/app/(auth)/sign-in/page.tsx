import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";
import { signInAsTestUser, signInWithGoogle } from "@/server/http/actions/auth-actions";
import { currentUser } from "@/server/http/session";
import { authGateway } from "@/server/composition-root/auth-gateway";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <Logo size={32} />
      <h1 className="font-serif text-3xl">Sign in</h1>
      <p className="text-sm text-muted">Billfold is invite-only. Use the Google account that was approved for you.</p>
      {error && <p role="alert" className="text-sm text-danger">We could not sign you in. Please try again.</p>}
      <form action={signInWithGoogle}><Button type="submit" className="w-full">Continue with Google</Button></form>
      {authGateway.isTestMode() && (
        <form action={signInAsTestUser} className="flex flex-col gap-3 rounded-md border border-dashed border-line p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Test mode</p>
          <Field name="email" type="email" label="Test user email" required />
          <Button type="submit" variant="secondary">Sign in as test user</Button>
        </form>
      )}
    </div>
  );
}
