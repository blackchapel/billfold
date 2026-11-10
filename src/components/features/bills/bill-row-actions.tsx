"use client";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";

type Action = (p: ActionState | null) => Promise<ActionState>;

/** One small button that runs a server action and shows why it was refused, if it was. */
function ActionButton({ action, label, busyLabel, variant = "secondary", confirm }: { action: Action; label: string; busyLabel: string; variant?: "secondary" | "danger"; confirm?: string }) {
  const { formAction, pending, error } = useActionForm<void>(((p: ActionState | null) => action(p)) as never);
  return (
    <form action={formAction} className="inline-flex items-center gap-2" onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      <Button type="submit" variant={variant} disabled={pending} className="min-h-9 px-3">{pending ? busyLabel : label}</Button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </form>
  );
}

export interface BillActionsProps {
  paid: boolean;
  deleted: boolean;
  needsReview: boolean;
  /** Server actions, already bound to this bill by the page. */
  actions: { markPaid: Action; markUnpaid: Action; remove: Action; restore: Action; markChecked: Action };
}

export function BillActions({ paid, deleted, needsReview, actions }: BillActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {deleted ? <ActionButton action={actions.restore} label="Restore" busyLabel="Restoring…" /> : (
        <>
          {needsReview && <ActionButton action={actions.markChecked} label="Mark checked" busyLabel="Saving…" />}
          <ActionButton action={paid ? actions.markUnpaid : actions.markPaid} label={paid ? "Mark unpaid" : "Mark paid"} busyLabel="Saving…" />
          <ActionButton action={actions.remove} label="Delete" busyLabel="Deleting…" variant="danger" confirm="Delete this bill? It disappears from lists and reports, and the same email will not be filed again. You can restore it later." />
        </>
      )}
    </div>
  );
}
