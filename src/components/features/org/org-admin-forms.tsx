"use client";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";

type A = (p: ActionState | null, f: FormData) => Promise<ActionState>;

export function RenameForm({ action, name }: { action: A; name: string }) {
  const { formAction, pending, error, state } = useActionForm<void>(action as never);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field name="name" label="Organisation name" defaultValue={name} required minLength={2} maxLength={60} />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>Rename</Button>
        {state?.ok && <span role="status" className="text-sm text-muted">Saved.</span>}
      </div>
      {error && <FormMessage>{error}</FormMessage>}
    </form>
  );
}

export function TransferForm({ action, candidates }: { action: A; candidates: { id: string; label: string }[] }) {
  const { formAction, pending, error } = useActionForm<void>(action as never);
  if (candidates.length === 0) return <p className="text-sm text-muted">Invite another member first, then you can hand over ownership.</p>;
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="newOwnerId" className="text-sm font-medium">New owner</label>
      <select id="newOwnerId" name="newOwnerId" required className="min-h-10 rounded-md border border-line bg-surface px-3 text-sm">
        {candidates.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <p className="text-xs text-muted">You will become an admin. Only the new owner can undo this.</p>
      <div><Button type="submit" variant="danger" disabled={pending}>Transfer ownership</Button></div>
      {error && <FormMessage>{error}</FormMessage>}
    </form>
  );
}

export function DeleteForm({ action, slug }: { action: A; slug: string }) {
  const { formAction, pending, error } = useActionForm<void>(action as never);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field name="confirm" label={`Type "${slug}" to confirm`} autoComplete="off" required />
      <p className="text-xs text-muted">This hides the organisation for everyone and destroys its encryption key, so saved connections can never be read again.</p>
      <div><Button type="submit" variant="danger" disabled={pending}>Delete organisation</Button></div>
      {error && <FormMessage>{error}</FormMessage>}
    </form>
  );
}
