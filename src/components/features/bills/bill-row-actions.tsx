"use client";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";
import { DeleteBillDialog } from "./delete-bill-dialog";

type Action = (p: ActionState | null) => Promise<ActionState>;

/** One small button that runs a server action and shows why it was refused, if it was. */
function ActionButton({ action, label, busyLabel, variant = "secondary" }: { action: Action; label: string; busyLabel: string; variant?: "secondary" | "danger" }) {
  const { formAction, pending, error } = useActionForm<void>(((p: ActionState | null) => action(p)) as never);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <Button type="submit" variant={variant} disabled={pending} className="min-h-9 px-3">{pending ? busyLabel : label}</Button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </form>
  );
}

export interface BillActionsProps {
  paid: boolean;
  deleted: boolean;
  needsReview: boolean;
  /** What the delete dialog says about this bill. */
  biller: string;
  month: string;
  /** True for a bill that came from an email (a bill typed in by hand has no email to file again). */
  fromEmail: boolean;
  /** Server actions, already bound to this bill by the page. `remove` hides the bill, `refile` deletes it for good so its email can be filed again. */
  actions: { markPaid: Action; markUnpaid: Action; remove: Action; refile: Action; restore: Action; markChecked: Action };
}

export function BillActions({ paid, deleted, needsReview, biller, month, fromEmail, actions }: BillActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {deleted ? (
        <>
          <ActionButton action={actions.restore} label="Restore" busyLabel="Restoring…" />
          {fromEmail && <DeleteBillDialog mode="refile-only" biller={biller} month={month} hide={actions.remove} refile={actions.refile} />}
        </>
      ) : (
        <>
          {needsReview && <ActionButton action={actions.markChecked} label="Mark checked" busyLabel="Saving…" />}
          <ActionButton action={paid ? actions.markUnpaid : actions.markPaid} label={paid ? "Mark unpaid" : "Mark paid"} busyLabel="Saving…" />
          <DeleteBillDialog mode={fromEmail ? "choose" : "plain"} biller={biller} month={month} hide={actions.remove} refile={actions.refile} />
        </>
      )}
    </div>
  );
}
