import { MonthlyChart } from "@/components/features/reports/monthly-chart";
import { Badge } from "@/components/ui/badge";
import { periodLabel } from "@/constants/runs";
import { getReport } from "@/server/http/queries/bill-queries";
import { requireOrg } from "@/server/http/session";
import type { DueRowDto } from "@/types/bill";
import { TextLink } from "@/components/features/shell/pending-link";

export const metadata = { title: "Reports" };

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short" });
const toneClass = { good: "text-accent", warn: "text-warn", neutral: "text-muted" } as const;

function DueList({ title, rows, orgSlug, empty }: { title: string; rows: DueRowDto[]; orgSlug: string; empty: string }) {
  return (
    <section aria-label={title}>
      <h3 className="font-serif text-xl">{title}</h3>
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted">{empty}</p> : (
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
              <span><TextLink href={`/${orgSlug}/bills/${r.id}`} className="font-medium">{r.biller}</TextLink><span className="text-muted"> · {day(r.dueDate)} · {r.whenText}</span></span>
              <span className="num">{r.amountText ?? "amount not known"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function Reports({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ period?: string }> }) {
  const { orgSlug } = await params;
  const { period } = await searchParams;
  const { membership, permissions } = await requireOrg(orgSlug);
  const r = await getReport(membership.orgId, period ?? null);
  const empty = !r.hasBills;

  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-4xl">Reports</h1>
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3" aria-label="Choose a month">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="period" className="text-sm font-medium">Month</label>
          <select id="period" name="period" defaultValue={r.periodKey} className="min-h-10 rounded-md border border-line bg-surface px-3 text-sm">{r.months.map((m) => <option key={m} value={m}>{periodLabel(m)}</option>)}</select>
        </div>
        <button type="submit" className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium hover:bg-paper">Show</button>
      </form>
      {!empty && permissions.includes("reports.send") && <p className="mt-3 text-sm"><TextLink href={`/${orgSlug}/send?period=${r.periodKey}`}>Send {periodLabel(r.periodKey)} as an email summary</TextLink></p>}

      {empty ? (
        <p className="mt-8 rounded-md border border-dashed border-line p-6 text-sm text-muted">No bills yet, so there is nothing to report. Start a run on the <TextLink href={`/${orgSlug}/runs`}>Runs</TextLink> page, or <TextLink href={`/${orgSlug}/bills/new`}>add a bill by hand</TextLink>.</p>
      ) : (
        <>
          {r.insights.length > 0 && (
            <ul className="mt-6 space-y-2" aria-label="Things to know">
              {r.insights.map((i) => (
                <li key={i.text} className="flex items-start gap-3 text-sm"><span className="mt-0.5 shrink-0"><Badge tone={i.tone === "bad" ? "bad" : i.tone === "good" ? "good" : i.tone === "warn" ? "warn" : "neutral"}>{i.tone === "bad" ? "overdue" : i.tone === "good" ? "good" : i.tone === "warn" ? "note" : "info"}</Badge></span><span>{i.text}</span></li>
              ))}
            </ul>
          )}

          <dl className="mt-8 grid gap-6 border-y border-line py-5 sm:grid-cols-4">
            <div><dt className="text-xs uppercase tracking-wide text-muted">Total for {periodLabel(r.periodKey)}</dt><dd className="mt-1 font-serif text-3xl tabular-nums">{r.monthTotalText}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-muted">Bills</dt><dd className="mt-1 font-serif text-3xl">{r.monthCount}</dd>{r.missingAmounts > 0 && <dd className="text-xs text-muted">{r.missingAmounts} without an amount</dd>}</div>
            <div><dt className="text-xs uppercase tracking-wide text-muted">Not paid yet</dt><dd className="mt-1 font-serif text-3xl tabular-nums">{r.unpaidText}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-muted">Compared with last month</dt><dd className="mt-1 font-serif text-3xl">{r.changeText ? r.changeText.split(" on ")[0] : "—"}</dd>{r.monthInProgress ? <dd className="text-xs text-muted">This month is not over yet</dd> : r.previousTotalText && r.changeText && <dd className="text-xs text-muted">last month {r.previousTotalText}</dd>}</div>
          </dl>

          <section className="mt-10" aria-label="Last 12 months">
            <h2 className="font-serif text-2xl">Last 12 months</h2>
            <p className="mt-1 text-sm text-muted">Total of all bills in each month. Select a month to see it in detail.</p>
            <div className="mt-4"><MonthlyChart trend={r.trend} axis={r.axis} selectedKey={r.periodKey} hrefBase={`/${orgSlug}/reports`} /></div>
          </section>

          <section className="mt-10" aria-label="By biller">
            <h2 className="font-serif text-2xl">By biller, {periodLabel(r.periodKey)}</h2>
            {r.breakdown.length === 0 ? <p className="mt-2 text-sm text-muted">No bills in this month.</p> : (
              <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Bills by biller">
                <table className="w-full min-w-[20rem] text-sm">
                  <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th scope="col" className="py-2 pr-4 font-medium">Biller</th><th scope="col" className="py-2 pr-4 text-right font-medium">Bills</th><th scope="col" className="py-2 pr-4 text-right font-medium">Total</th><th scope="col" className="py-2 text-right font-medium">Vs last month</th></tr></thead>
                  <tbody>{r.breakdown.map((b) => (
                    <tr key={b.biller} className="border-b border-line"><th scope="row" className="py-2 pr-4 text-left font-normal">{b.biller}</th><td className="num py-2 pr-4">{b.count}</td><td className="num py-2 pr-4">{b.totalText}</td><td className={`num py-2 ${toneClass[b.changeTone]}`}>{b.changeText}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <DueList title="Overdue" rows={r.overdue} orgSlug={orgSlug} empty="Nothing is overdue." />
            <DueList title="Due in the next 7 days" rows={r.dueSoon} orgSlug={orgSlug} empty="Nothing is due this week." />
          </div>
        </>
      )}
    </div>
  );
}
