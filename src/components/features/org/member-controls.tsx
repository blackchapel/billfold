"use client";
import { PERMISSIONS } from "@/constants/permissions";
import { ROLES } from "@/constants/roles";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";

type A = (p: ActionState | null, f: FormData) => Promise<ActionState>;

export function RoleForm({ action, role, disabled }: { action: A; role: string; disabled: boolean }) {
  const { formAction, pending, error } = useActionForm<void>(action as never);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <select name="role" defaultValue={role} disabled={disabled} aria-label="Role" className="min-h-9 rounded-md border border-line bg-surface px-2 text-sm">
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <Button type="submit" variant="secondary" disabled={disabled || pending} className="min-h-9">Save</Button>
      {error && <FormMessage>{error}</FormMessage>}
    </form>
  );
}

export function OverridesForm({ action, overrides, disabled }: { action: A; overrides: Record<string, boolean>; disabled: boolean }) {
  const { formAction, pending, error } = useActionForm<void>(action as never);
  return (
    <form action={formAction} className="mt-2 grid gap-2 sm:grid-cols-2">
      {PERMISSIONS.map((p) => (
        <label key={p} className="flex items-center justify-between gap-2 text-xs">
          <span className="font-mono">{p}</span>
          <select name={`perm:${p}`} disabled={disabled} defaultValue={p in overrides ? (overrides[p] ? "grant" : "revoke") : "default"} className="rounded-sm border border-line bg-surface px-1 py-0.5">
            <option value="default">role default</option><option value="grant">grant</option><option value="revoke">revoke</option>
          </select>
        </label>
      ))}
      <div className="sm:col-span-2 flex items-center gap-2">
        <Button type="submit" variant="secondary" disabled={disabled || pending} className="min-h-9">Save permissions</Button>
        {error && <FormMessage>{error}</FormMessage>}
      </div>
    </form>
  );
}
