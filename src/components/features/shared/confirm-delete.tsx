"use client";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";

/** A delete button that asks "are you sure?" first and shows the server's reason if it refuses. */
export function ConfirmDelete({ action, name, warning }: { action: (p: ActionState | null) => Promise<ActionState>; name: string; warning: string }) {
  const { formAction, pending, error } = useActionForm<void>(((p: ActionState | null) => action(p)) as never);
  return (
    <form action={formAction} className="flex items-center gap-3"
      onSubmit={(e) => { if (!window.confirm(`Delete ${name}? ${warning}`)) e.preventDefault(); }}>
      <Button type="submit" variant="danger" disabled={pending} className="min-h-9">Delete</Button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </form>
  );
}
