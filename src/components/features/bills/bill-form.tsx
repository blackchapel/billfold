"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { periodLabel } from "@/constants/runs";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";
import type { BillRowDto } from "@/types/bill";
import type { ConnectionOption } from "@/types/source";
import { BillUploadFields } from "./bill-upload-fields";

type A = (p: ActionState | null, f: FormData) => Promise<ActionState>;

/** Used for both "add a bill by hand" (no `initial`) and "correct this bill" (with `initial`). */
export function BillForm({ action, periods, initial, drives, cancelHref }: { action: A; periods: string[]; initial?: BillRowDto; drives?: ConnectionOption[]; cancelHref: string }) {
  const { formProps, pending, error } = useActionForm<void>(action as never);
  const [period, setPeriod] = useState(initial?.periodKey ?? periods[0] ?? "");
  return (
    <form {...formProps} className="flex max-w-xl flex-col gap-5">
      <Field name="billerName" label="Biller" defaultValue={initial?.billerName} required maxLength={80} placeholder="Reliance Jio" />
      <Field name="amountText" label="Amount (₹)" defaultValue={initial?.amountPlain} inputMode="decimal" autoComplete="off" placeholder="1234.50"
        hint={initial ? "Leave empty if the amount is not known yet." : "The total to pay, for example 1234.50."} required={!initial} className="max-w-48 tabular-nums" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="periodKey" className="text-sm font-medium">Month</label>
        <select id="periodKey" name="periodKey" required value={period} onChange={(e) => setPeriod(e.target.value)} className="min-h-10 max-w-64 rounded-md border border-line bg-surface px-3 text-sm">
          {periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
        </select>
        <p className="text-xs text-muted">The month the bill counts towards in reports.</p>
      </div>
      <div className="flex flex-wrap gap-4">
        <Field name="billDate" label="Bill date (optional)" type="date" defaultValue={initial?.billDate ?? ""} />
        <Field name="dueDate" label="Due date (optional)" type="date" defaultValue={initial?.dueDate ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="note" className="text-sm font-medium">Note (optional)</label>
        <textarea id="note" name="note" rows={3} maxLength={300} defaultValue={initial?.note ?? ""} className="rounded-md border border-line bg-surface px-3 py-2 text-sm" />
      </div>
      {!initial && drives && <BillUploadFields drives={drives} periodKey={period} />}
      {initial && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="markChecked" defaultChecked={initial.needsReview} /> I have checked this bill against the original
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : initial ? "Save changes" : "Add bill"}</Button>
        <a href={cancelHref} className="text-sm underline underline-offset-4">Cancel</a>
      </div>
      {error && <FormMessage>{error}</FormMessage>}
    </form>
  );
}
