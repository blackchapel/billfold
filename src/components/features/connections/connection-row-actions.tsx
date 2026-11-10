"use client";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";

type TestAction = (p: ActionState<string> | null) => Promise<ActionState<string>>;
type RemoveAction = (p: ActionState | null) => Promise<ActionState>;

export function TestButton({ action }: { action: TestAction }) {
  const { formAction, pending, state } = useActionForm<string>(((p: ActionState<string> | null) => action(p)) as never);
  return (
    <form action={formAction} className="flex items-center gap-3">
      <Button type="submit" variant="secondary" disabled={pending} className="min-h-9">{pending ? "Checking…" : "Test"}</Button>
      {state && <span role="status" className={`text-xs ${state.ok ? "text-muted" : "text-danger"}`}>{state.ok ? state.data : state.message}</span>}
    </form>
  );
}

export function RemoveButton({ action, label }: { action: RemoveAction; label: string }) {
  const { formAction, pending, error } = useActionForm<void>(((p: ActionState | null) => action(p)) as never);
  return (
    <form action={formAction} className="flex items-center gap-3"
      onSubmit={(e) => { if (!window.confirm(`Remove ${label}? Billfold will forget its saved login. Runs that use it will stop working.`)) e.preventDefault(); }}>
      <Button type="submit" variant="danger" disabled={pending} className="min-h-9">Remove</Button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </form>
  );
}

export function ConnectionRowActions({ test, remove, label }: { test: TestAction; remove: RemoveAction; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <TestButton action={test} />
      <RemoveButton action={remove} label={label} />
    </div>
  );
}
