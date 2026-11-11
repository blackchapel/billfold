import { ConfirmDelete } from "@/components/features/shared/confirm-delete";
import { SetDefaultButton } from "@/components/features/sends/set-default-button";
import { Badge } from "@/components/ui/badge";
import { deleteTemplateAction, setDefaultTemplateAction } from "@/server/http/actions/template-actions";
import { builtInTemplate, listTemplateDtos } from "@/server/http/queries/send-queries";
import { requireOrg } from "@/server/http/session";
import { LinkButton, TextLink } from "@/components/features/shell/pending-link";

export const metadata = { title: "Templates" };


export default async function Templates({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  const canManage = permissions.includes("templates.manage");
  const templates = await listTemplateDtos(membership.orgId);
  const builtIn = builtInTemplate();
  const anyDefault = templates.some((t) => t.isDefault);
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-4xl">Email templates</h1>
      <p className="mt-2 text-sm text-muted">The wording around the table of bills in a summary email. Billfold has a standard wording; add your own if you prefer.</p>
      {canManage && <p className="mt-4"><LinkButton href={`/${orgSlug}/templates/new`}>New template</LinkButton></p>}
      <ul className="mt-6 divide-y divide-line border-y border-line">
        <li className="flex flex-col gap-2 py-3 text-sm">
          <p><span className="font-medium">{builtIn.name}</span> <span className="text-muted">· built in</span> {!anyDefault && <Badge tone="good">default</Badge>}</p>
          <p className="text-xs text-muted">Subject: {builtIn.subject}</p>
          {canManage && anyDefault && <SetDefaultButton action={setDefaultTemplateAction.bind(null, orgSlug, null) as never} label="Use this as the default" />}
        </li>
        {templates.map((t) => (
          <li key={t.id} data-template={t.name} className="flex flex-col gap-2 py-3 text-sm">
            <p><span className="font-medium">{t.name}</span> {t.isDefault && <Badge tone="good">default</Badge>}</p>
            <p className="text-xs text-muted">Subject: {t.subject}</p>
            {canManage && (
              <div className="flex flex-wrap items-center gap-4">
                <TextLink href={`/${orgSlug}/templates/${t.id}`}>Edit</TextLink>
                {!t.isDefault && <SetDefaultButton action={setDefaultTemplateAction.bind(null, orgSlug, t.id) as never} label="Make default" />}
                <ConfirmDelete action={deleteTemplateAction.bind(null, orgSlug, t.id) as never} name={t.name} warning="Emails already sent keep their text." />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
