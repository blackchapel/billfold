import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageFrame } from "@/components/features/sends/message-frame";
import { SendProgress } from "@/components/features/sends/send-progress";
import { periodLabel } from "@/constants/runs";
import { cancelSendAction, processNextSendAction, retrySendAction } from "@/server/http/actions/send-actions";
import { getSendDetail } from "@/server/http/queries/send-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Sent email" };
// Each email is one server action call from this page; this is the time limit that applies to it.
export const maxDuration = 60;

export default async function SendPage({ params }: { params: Promise<{ orgSlug: string; sendId: string }> }) {
  const { orgSlug, sendId } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  const send = await getSendDetail(membership.orgId, sendId);
  if (!send) notFound();
  return (
    <div className="max-w-3xl">
      <p className="text-sm"><Link href={`/${orgSlug}/send`} className="underline underline-offset-4">All sent emails</Link></p>
      <h1 className="mt-2 font-serif text-4xl">{periodLabel(send.periodKey)}{send.isTest ? " (test)" : ""}</h1>
      <p className="mt-1 text-sm text-muted">{send.billCount} {send.billCount === 1 ? "bill" : "bills"} · {send.totalText} · {send.attachmentCount} PDF{send.attachmentCount === 1 ? "" : "s"} attached · from {send.fromAccount}</p>
      <div className="mt-6">
        <SendProgress key={send.id} initial={send} canSend={permissions.includes("reports.send")}
          processNext={processNextSendAction.bind(null, orgSlug, send.id) as never} cancel={cancelSendAction.bind(null, orgSlug, send.id) as never} retry={retrySendAction.bind(null, orgSlug, send.id) as never} />
      </div>
      <details className="mt-10">
        <summary className="cursor-pointer font-serif text-xl">The email as it was sent</summary>
        <p className="mt-2 text-sm"><span className="text-muted">Subject: </span>{send.subject}</p>
        <div className="mt-3"><MessageFrame html={send.bodyHtml} title="The email as it was sent" /></div>
      </details>
    </div>
  );
}
