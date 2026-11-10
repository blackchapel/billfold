"use client";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";

export function SetDefaultButton({ action, label }: { action: (p: ActionState | null) => Promise<ActionState>; label: string }) {
  const { formAction, pending, error } = useActionForm<void>(((p: ActionState | null) => action(p)) as never);
  return (
    <form action={formAction} className="flex items-center gap-3">
      <Button type="submit" variant="secondary" disabled={pending} className="min-h-9">{label}</Button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </form>
  );
}
