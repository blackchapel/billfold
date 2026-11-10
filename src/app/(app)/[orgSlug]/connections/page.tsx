import { ConnectionRowActions } from "@/components/features/connections/connection-row-actions";
import { ConnectionList } from "@/components/features/connections/connection-list";
import { MailAccountForm } from "@/components/features/connections/mail-account-form";
import { addMailAccountAction, removeConnectionAction, testConnectionAction } from "@/server/http/actions/connection-actions";
import { googleAvailability, listConnections } from "@/server/http/queries/connection-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Connections" };

export default async function Connections({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const { orgSlug } = await params;
  const { error, connected } = await searchParams;
  const { membership, permissions } = await requireOrg(orgSlug);
  const canManage = permissions.includes("connections.manage");
  const items = await listConnections(membership.orgId);
  const google = googleAvailability();
  const start = (kind: string) => `/api/connections/google/start?org=${encodeURIComponent(orgSlug)}&kind=${kind}`;

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-4xl">Connections</h1>
      <p className="mt-2 text-sm text-muted">The accounts Billfold uses: a mailbox to read bills from, a Google Drive to file them in, and a mail account to send summaries.</p>
      {connected && <p role="status" className="mt-4 rounded-md border border-accent px-3 py-2 text-sm">Connected.</p>}
      {error && <p role="alert" className="mt-4 rounded-md border border-danger px-3 py-2 text-sm text-danger">{error}</p>}

      <section className="mt-8">
        <h2 className="font-serif text-2xl">Linked accounts</h2>
        <ConnectionList items={items} actions={(c) => canManage && (
          <ConnectionRowActions label={c.label}
            test={testConnectionAction.bind(null, orgSlug, c.id) as never} remove={removeConnectionAction.bind(null, orgSlug, c.id) as never} />
        )} />
      </section>

      {canManage ? (
        <>
          <section className="mt-10 border-t border-line pt-6">
            <h2 className="font-serif text-2xl">Connect with Google</h2>
            <p className="mt-1 text-sm text-muted">You will be sent to Google to approve access. Billfold only sees files it creates in Drive, and Gmail is used to read bills and send summaries.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {([["google_drive", "Connect Google Drive"], ["gmail", "Connect Gmail"]] as const).map(([kind, label]) => (
                google[kind]
                  ? <a key={kind} href={start(kind)} className="inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90">{label}</a>
                  : <span key={kind} className="inline-flex min-h-10 items-center rounded-md border border-line px-4 text-sm text-muted" title="The owner has not finished the Google Cloud setup yet">{label} (not set up yet)</span>
              ))}
            </div>
          </section>
          <section className="mt-10 border-t border-line pt-6">
            <h2 className="font-serif text-2xl">Add a mail account with an app password</h2>
            <p className="mb-4 mt-1 text-sm text-muted">An alternative to Gmail sign-in. Works with any provider that offers IMAP and SMTP.</p>
            <MailAccountForm action={addMailAccountAction.bind(null, orgSlug) as never} />
          </section>
        </>
      ) : <p className="mt-8 text-sm text-muted">You can see which accounts are linked. Ask an admin to change them.</p>}
    </div>
  );
}
