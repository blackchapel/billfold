import Link from "next/link";
import { redirect } from "next/navigation";
import { TemplateForm } from "@/components/features/templates/template-form";
import { saveTemplateAction } from "@/server/http/actions/template-actions";
import { builtInTemplate, placeholderHelp } from "@/server/http/queries/send-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "New template" };

export default async function NewTemplate({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { permissions } = await requireOrg(orgSlug);
  if (!permissions.includes("templates.manage")) redirect(`/${orgSlug}/templates`);
  const { name: _name, ...start } = builtInTemplate(); // eslint-disable-line @typescript-eslint/no-unused-vars
  return (
    <div>
      <p className="text-sm"><Link href={`/${orgSlug}/templates`} className="underline underline-offset-4">All templates</Link></p>
      <h1 className="mt-2 font-serif text-4xl">New template</h1>
      <p className="mt-1 text-sm text-muted">It starts with the standard wording; change what you like.</p>
      <div className="mt-6"><TemplateForm action={saveTemplateAction.bind(null, orgSlug, null) as never} template={{ name: "", ...start }} placeholders={placeholderHelp()} cancelHref={`/${orgSlug}/templates`} /></div>
    </div>
  );
}
