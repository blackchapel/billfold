"use client";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";

type Action = (prev: ActionState<string> | null, form: FormData) => Promise<ActionState<string>>;

export function CreateOrgForm({ action }: { action: Action }) {
  const { formProps, pending, error } = useActionForm(action);
  return (
    <form {...formProps} className="flex flex-col gap-4">
      <Field name="name" label="Organisation name" placeholder="The Sharma household" required minLength={2} maxLength={60} />
      {error && <FormMessage>{error}</FormMessage>}
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create organisation"}</Button>
    </form>
  );
}

export function JoinOrgForm({ action }: { action: Action }) {
  const { formProps, pending, error } = useActionForm(action);
  return (
    <form {...formProps} className="flex flex-col gap-4">
      <Field name="code" label="Invite code" placeholder="e.g. K7M2Q9XR4TBW" autoComplete="off" required className="font-mono uppercase" />
      {error && <FormMessage>{error}</FormMessage>}
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Joining…" : "Join with code"}</Button>
    </form>
  );
}
