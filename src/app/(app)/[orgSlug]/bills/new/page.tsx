import Link from "next/link";
import { redirect } from "next/navigation";
import { BillForm } from "@/components/features/bills/bill-form";
import { saveBillAction } from "@/server/http/actions/bill-actions";
import { billPeriodChoices } from "@/server/http/queries/bill-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Add a bill" };

export default async function NewBill({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { permissions } = await requireOrg(orgSlug);
  if (!permissions.includes("bills.edit")) redirect(`/${orgSlug}/bills`);
  return (
    <div>
      <p className="text-sm"><Link href={`/${orgSlug}/bills`} className="underline underline-offset-4">All bills</Link></p>
      <h1 className="mt-2 font-serif text-4xl">Add a bill</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">For a bill that never came by email: a paper bill, a cash payment, anything Billfold could not see.</p>
      <div className="mt-6"><BillForm action={saveBillAction.bind(null, orgSlug, null) as never} periods={billPeriodChoices()} cancelHref={`/${orgSlug}/bills`} /></div>
    </div>
  );
}
