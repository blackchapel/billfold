"use client";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";

export function InviteForm({ action }: { action: (p: ActionState<string> | null, f: FormData) => Promise<ActionState<string>> }) {
  const { formAction, pending, error, data } = useActionForm(action);
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="role" className="text-sm font-medium">Role</label>
        <select id="role" name="role" defaultValue="member" className="min-h-10 rounded-md border border-line bg-surface px-3 text-sm">
          <option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option>
        </select>
      </div>
      <Field name="maxUses" label="Max uses" type="number" min={1} max={100} defaultValue={1} />
      <Field name="expiresInDays" label="Expires in (days)" type="number" min={1} max={90} defaultValue={7} />
      <div className="sm:col-span-3 flex flex-col gap-3">
        {error && <FormMessage>{error}</FormMessage>}
        {data && (
          <p className="rounded-md border border-accent p-3 text-sm">
            Share this code now — it will not be shown again: <code className="font-mono text-base font-semibold" data-testid="invite-code">{data}</code>
          </p>
        )}
        <Button type="submit" disabled={pending} className="self-start">{pending ? "Creating…" : "Create invite code"}</Button>
      </div>
    </form>
  );
}
