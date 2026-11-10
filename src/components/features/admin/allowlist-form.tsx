"use client";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";

export function AllowlistForm({ action }: { action: (p: ActionState | null, f: FormData) => Promise<ActionState> }) {
  const { formAction, pending, error } = useActionForm<void>(action as never);
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field name="email" type="email" label="Google account email" required />
      <Field name="note" label="Note (optional)" />
      <Button type="submit" disabled={pending}>Add</Button>
      {error && <div className="sm:col-span-3"><FormMessage>{error}</FormMessage></div>}
    </form>
  );
}
