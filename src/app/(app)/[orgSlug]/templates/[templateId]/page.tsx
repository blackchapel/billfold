import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TemplateForm } from "@/components/features/templates/template-form";
import { saveTemplateAction } from "@/server/http/actions/template-actions";
import { listTemplateDtos, placeholderHelp } from "@/server/http/queries/send-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Edit template" };

export default async function EditTemplate({ params }: { params: Promise<{ orgSlug: string; templateId: string }> }) {
  const { orgSlug, templateId } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  if (!permissions.includes("templates.manage")) redirect(`/${orgSlug}/templates`);
  const template = (await listTemplateDtos(membership.orgId)).find((t) => t.id === templateId);
  if (!template) notFound();
  return (
    <div>
      <p className="text-sm"><Link href={`/${orgSlug}/templates`} className="underline underline-offset-4">All templates</Link></p>
      <h1 className="mt-2 font-serif text-4xl">{template.name}</h1>
      <div className="mt-6"><TemplateForm key={template.id} action={saveTemplateAction.bind(null, orgSlug, template.id) as never} template={template} placeholders={placeholderHelp()} cancelHref={`/${orgSlug}/templates`} /></div>
    </div>
  );
}
