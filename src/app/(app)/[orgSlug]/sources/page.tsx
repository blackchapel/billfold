import Link from "next/link";
import { ConfirmDelete } from "@/components/features/shared/confirm-delete";
import { PASSWORD_MODE_LABELS } from "@/constants/sources";
import { deleteSourceAction } from "@/server/http/actions/source-actions";
import { listSources, mailboxOptions } from "@/server/http/queries/source-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Sources" };

const button = "inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90";

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
        ? <p className="mt-4"><Link href={`/${orgSlug}/sources/new`} className={button}>New source</Link></p>
        : <p className="mt-4 text-sm text-muted">Connect a Gmail or IMAP mailbox on the <Link href={`/${orgSlug}/connections`} className="underline underline-offset-4">Connections</Link> page before adding a source.</p>)}
      {sources.length === 0 ? <p className="mt-8 text-sm text-muted">No sources yet.</p> : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {sources.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-3 text-sm">
              <p><span className="font-medium">{s.name}</span><span className="text-muted"> · reads {s.connectionLabel}</span></p>
              <p className="text-xs text-muted">From {s.senders.join(", ")}{s.subjectContains ? ` · subject has "${s.subjectContains}"` : ""}{s.requireAttachment ? " · with attachment" : ""}</p>
              <p className="text-xs text-muted">{PASSWORD_MODE_LABELS[s.passwordMode]}{s.passwordMode === "static" && !s.hasStaticPassword ? " (no password saved)" : ""}</p>
              {canManage && (
                <div className="flex flex-wrap items-center gap-4">
                  <Link href={`/${orgSlug}/sources/${s.id}`} className="underline underline-offset-4">Edit and test</Link>
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
