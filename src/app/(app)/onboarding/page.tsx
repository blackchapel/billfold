import { CreateOrgForm, JoinOrgForm } from "@/components/features/org/create-org-form";
import { Logo } from "@/components/ui/logo";
import { createOrgAction, joinOrgAction } from "@/server/http/actions/org-actions";

export const metadata = { title: "Get started" };

export default function Onboarding() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Logo size={32} />
      <h1 className="mt-8 font-serif text-4xl">Welcome. Let&rsquo;s get you set up.</h1>
      <p className="mt-3 text-muted">Start your own organisation, or join one with an invite code someone sent you.</p>
      <div className="mt-10 grid gap-10 md:grid-cols-2">
        <section aria-labelledby="create"><h2 id="create" className="mb-4 font-serif text-2xl">Create an organisation</h2><CreateOrgForm action={createOrgAction} /></section>
        <section aria-labelledby="join"><h2 id="join" className="mb-4 font-serif text-2xl">Join with a code</h2><JoinOrgForm action={joinOrgAction} /></section>
      </div>
    </div>
  );
}
