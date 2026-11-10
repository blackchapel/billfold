"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";
import type { RecipientDto } from "@/types/send";

type A = (p: ActionState | null, f: FormData) => Promise<ActionState>;

/** Adds a person, or edits one when `recipient` is given. */
export function RecipientForm({ action, recipient, cancelHref }: { action: A; recipient?: RecipientDto; cancelHref?: string }) {
  const { formProps, pending, error } = useActionForm<void>(action as never, { resetOnSuccess: !recipient });
  return (
    <form {...formProps} className="flex max-w-xl flex-col gap-4">
      <Field name="name" label="Name" required maxLength={80} defaultValue={recipient?.name} autoComplete="off" />
      <Field name="email" type="email" label="Email address" required maxLength={254} defaultValue={recipient?.email} autoComplete="off" hint="Summaries are sent to this address, one email for each person." />
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : recipient ? "Save changes" : "Add recipient"}</Button>
        {cancelHref && <Link href={cancelHref} className="text-sm underline underline-offset-4">Cancel</Link>}
      </div>
      {error && <FormMessage>{error}</FormMessage>}
    </form>
  );
}
