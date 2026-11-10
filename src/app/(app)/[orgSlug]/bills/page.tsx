import Link from "next/link";
import { BillActions } from "@/components/features/bills/bill-row-actions";
import { Badge } from "@/components/ui/badge";
import { periodLabel } from "@/constants/runs";
import { markBillCheckedAction, setBillDeletedAction, setBillPaidAction } from "@/server/http/actions/bill-actions";
import { listBills, parseBillFilter } from "@/server/http/queries/bill-queries";
import { requireOrg } from "@/server/http/session";

export const metadata = { title: "Bills" };

const button = "inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90";
const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "—");

export default async function Bills({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ period?: string; q?: string; filter?: string }> }) {
  const { orgSlug } = await params;
  const raw = await searchParams;
  const { membership, permissions } = await requireOrg(orgSlug);
  const canEdit = permissions.includes("bills.edit");
  const { filter, choice, period, q } = parseBillFilter(raw);
  const data = await listBills(membership.orgId, filter);
  const exportQuery = new URLSearchParams({ ...(period ? { period } : {}), ...(q ? { q } : {}), ...(choice !== "all" ? { filter: choice } : {}) }).toString();
  const select = "min-h-10 rounded-md border border-line bg-surface px-3 text-sm";

  return (
    <div>
      <h1 className="font-serif text-4xl">Bills</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">Every bill Billfold has filed, and any you add by hand. Check the ones it was unsure about, mark bills paid, and download the list.</p>
      {data.needsReviewCount > 0 && choice !== "review" && (
        <p className="mt-4 rounded-md border border-warn px-4 py-3 text-sm">
          <span className="font-medium">{data.needsReviewCount} {data.needsReviewCount === 1 ? "bill needs" : "bills need"} a check.</span>{" "}
          <Link href={`/${orgSlug}/bills?filter=review`} className="underline underline-offset-4">Show them</Link>
        </p>
      )}

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3" aria-label="Filter bills">
        <div className="flex flex-col gap-1.5"><label htmlFor="period" className="text-sm font-medium">Month</label>
          <select id="period" name="period" defaultValue={period} className={select}><option value="">All months</option>{data.months.map((m) => <option key={m} value={m}>{periodLabel(m)}</option>)}</select></div>
        <div className="flex flex-col gap-1.5"><label htmlFor="filter" className="text-sm font-medium">Show</label>
          <select id="filter" name="filter" defaultValue={choice} className={select}><option value="all">All bills</option><option value="review">Needs a check</option><option value="unpaid">Not paid yet</option><option value="deleted">Deleted</option></select></div>
        <div className="flex flex-col gap-1.5"><label htmlFor="q" className="text-sm font-medium">Search</label>
          <input id="q" name="q" type="search" defaultValue={q} maxLength={80} placeholder="Biller or source" className={`${select} w-48`} /></div>
        <button type="submit" className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium hover:bg-paper">Apply</button>
        <a href={`/${orgSlug}/bills/export${exportQuery ? `?${exportQuery}` : ""}`} className="inline-flex min-h-10 items-center text-sm underline underline-offset-4">Download CSV</a>
        {canEdit && <Link href={`/${orgSlug}/bills/new`} className={`${button} ml-auto`}>Add a bill</Link>}
      </form>

      {data.rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted">{choice === "review" ? "Nothing needs a check right now." : choice === "deleted" ? "No deleted bills." : "No bills match. Start a run on the Runs page, or add one by hand."}</p>
      ) : (
        <div className="mt-6 overflow-x-auto" tabIndex={0} role="region" aria-label="Bills">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">Biller</th><th scope="col" className="py-2 pr-4 font-medium">Month</th>
                <th scope="col" className="py-2 pr-4 font-medium">Due</th><th scope="col" className="py-2 pr-4 text-right font-medium">Amount</th>
                <th scope="col" className="py-2 pr-4 font-medium">Status</th>{canEdit && <th scope="col" className="py-2 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((b) => (
                <tr key={b.id} className="border-b border-line align-top" data-bill={b.billerName}>
                  <td className="py-3 pr-4">
                    <span className="font-medium">{b.billerName}</span>
                    <span className="block text-xs text-muted">{b.method === "manual" ? "added by hand" : b.sourceName}</span>
                    {b.note && <span className="block text-xs text-muted">{b.note}</span>}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">{periodLabel(b.periodKey)}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{day(b.dueDate)}</td>
                  <td className="num py-3 pr-4 whitespace-nowrap">{b.amountText ?? <span className="text-muted">not known</span>}</td>
                  <td className="py-3 pr-4"><div className="flex flex-wrap gap-1">
                    {b.deleted && <Badge tone="bad">deleted</Badge>}
                    {b.needsReview && <Badge tone="warn">needs a check</Badge>}
                    {b.paid ? <Badge tone="good">paid</Badge> : !b.deleted && <Badge>unpaid</Badge>}
                  </div>
                  {b.driveLink && <a href={b.driveLink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs underline underline-offset-4">Open in Drive</a>}</td>
                  {canEdit && (
                    <td className="py-3">
                      <div className="flex flex-col gap-2">
                        {!b.deleted && <Link href={`/${orgSlug}/bills/${b.id}`} className="text-sm underline underline-offset-4">Edit</Link>}
                        <BillActions paid={b.paid} deleted={b.deleted} needsReview={b.needsReview} actions={{
                          markPaid: setBillPaidAction.bind(null, orgSlug, b.id, true) as never, markUnpaid: setBillPaidAction.bind(null, orgSlug, b.id, false) as never,
                          remove: setBillDeletedAction.bind(null, orgSlug, b.id, true) as never, restore: setBillDeletedAction.bind(null, orgSlug, b.id, false) as never,
                          markChecked: markBillCheckedAction.bind(null, orgSlug, b.id) as never,
                        }} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row" colSpan={3} className="py-3 pr-4 text-left font-medium">{data.rows.length} {data.rows.length === 1 ? "bill" : "bills"}{data.missingAmounts > 0 ? ` (${data.missingAmounts} without an amount)` : ""}</th>
                <td className="num py-3 pr-4 font-semibold">{data.totalText}</td><td colSpan={canEdit ? 2 : 1} /></tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
