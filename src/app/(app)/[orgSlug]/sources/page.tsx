import { ConfirmDelete } from "@/components/features/shared/confirm-delete";
import { PASSWORD_MODE_LABELS } from "@/constants/sources";
import { deleteSourceAction } from "@/server/http/actions/source-actions";
import { listSources, mailboxOptions } from "@/server/http/queries/source-queries";
import { requireOrg } from "@/server/http/session";
import { LinkButton, TextLink } from "@/components/features/shell/pending-link";

export const metadata = { title: "Sources" };


export default async function Sources({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  const canManage = permissions.includes("sources.manage");
  const [sources, mailboxes] = await Promise.all([listSources(membership.orgId), mailboxOptions(membership.orgId)]);
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-4xl">Sources</h1>
      <p className="mt-2 text-sm text-muted">A source describes one kind of bill email: who sends it, what the subject looks like, and how its PDF is locked.</p>
      {canManage && (mailboxes.length > 0
        ? <p className="mt-4"><LinkButton href={`/${orgSlug}/sources/new`}>New source</LinkButton></p>
        : <p className="mt-4 text-sm text-muted">Connect a Gmail or IMAP mailbox on the <TextLink href={`/${orgSlug}/connections`}>Connections</TextLink> page before adding a source.</p>)}
      {sources.length === 0 ? <p className="mt-8 text-sm text-muted">No sources yet.</p> : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {sources.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-3 text-sm">
              <p><span className="font-medium">{s.name}</span><span className="text-muted"> · reads {s.connectionLabel}</span></p>
              <p className="text-xs text-muted">From {s.senders.join(", ")}{s.subjectContains ? ` · subject has "${s.subjectContains}"` : ""}{s.requireAttachment ? " · with attachment" : ""}</p>
              <p className="text-xs text-muted">{PASSWORD_MODE_LABELS[s.passwordMode]}{s.passwordMode === "static" && !s.hasStaticPassword ? " (no password saved)" : ""}</p>
              {canManage && (
                <div className="flex flex-wrap items-center gap-4">
                  <TextLink href={`/${orgSlug}/sources/${s.id}`}>Edit and test</TextLink>
                  <ConfirmDelete action={deleteSourceAction.bind(null, orgSlug, s.id) as never} name={s.name} warning="It will also be removed from any run configuration that uses it." />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
