import { notFound, redirect } from "next/navigation";
import { BillForm } from "@/components/features/bills/bill-form";
import { Badge } from "@/components/ui/badge";
import { saveBillAction } from "@/server/http/actions/bill-actions";
import { billPeriodChoices, getBill } from "@/server/http/queries/bill-queries";
import { requireOrg } from "@/server/http/session";
import { TextLink } from "@/components/features/shell/pending-link";

export const metadata = { title: "Check a bill" };

const readers: Record<string, string> = { text: "read by Billfold from the PDF text", gemini: "read by Gemini", manual: "typed in by hand" };

export default async function EditBill({ params }: { params: Promise<{ orgSlug: string; billId: string }> }) {
  const { orgSlug, billId } = await params;
  const { membership, permissions } = await requireOrg(orgSlug);
  if (!permissions.includes("bills.edit")) redirect(`/${orgSlug}/bills`);
  const bill = await getBill(membership.orgId, billId);
  if (!bill) notFound();
  if (bill.deleted) redirect(`/${orgSlug}/bills?filter=deleted`);
  // A bill can be filed under a month outside the usual list (older); keep its own month selectable.
  const periods = billPeriodChoices();
  if (!periods.includes(bill.periodKey)) periods.push(bill.periodKey);
  return (
    <div>
      <p className="text-sm"><TextLink href={`/${orgSlug}/bills`}>All bills</TextLink></p>
      <h1 className="mt-2 font-serif text-4xl">{bill.billerName}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{bill.sourceName === "Added by hand" ? "Added by hand" : `From ${bill.sourceName}, ${readers[bill.method] ?? bill.method}`}</span>
        {bill.needsReview && <Badge tone="warn">needs a check</Badge>}
        {bill.driveLink && <a href={bill.driveLink} target="_blank" rel="noopener noreferrer" className="text-ink underline underline-offset-4">Open the PDF in Drive</a>}
      </p>
      <div className="mt-6"><BillForm key={bill.id} action={saveBillAction.bind(null, orgSlug, bill.id) as never} periods={periods} initial={bill} cancelHref={`/${orgSlug}/bills`} /></div>
    </div>
  );
}
