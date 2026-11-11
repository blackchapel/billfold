import { redirect } from "next/navigation";
import { BillForm } from "@/components/features/bills/bill-form";
import { saveBillAction } from "@/server/http/actions/bill-actions";
import { billPeriodChoices } from "@/server/http/queries/bill-queries";
import { driveOptions } from "@/server/http/queries/source-queries";
import { requireOrg } from "@/server/http/session";
import { TextLink } from "@/components/features/shell/pending-link";

export const metadata = { title: "Add a bill" };

export default async function NewBill({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  if (!permissions.includes("bills.edit")) redirect(`/${orgSlug}/bills`);
  const drives = await driveOptions(membership.orgId);
  return (
    <div>
      <p className="text-sm"><TextLink href={`/${orgSlug}/bills`}>All bills</TextLink></p>
      <h1 className="mt-2 font-serif text-4xl">Add a bill</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">For a bill that never came by email: a paper bill, a cash payment, anything Billfold could not see. You can attach the document and Billfold files it in your Google Drive.</p>
      <div className="mt-6"><BillForm action={saveBillAction.bind(null, orgSlug, null) as never} periods={billPeriodChoices()} drives={drives} cancelHref={`/${orgSlug}/bills`} /></div>
    </div>
  );
}
