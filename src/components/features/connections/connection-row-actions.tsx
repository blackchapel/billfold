"use client";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
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

type PasswordAction = (p: ActionState | null, f: FormData) => Promise<ActionState>;

export function UpdatePasswordForm({ action }: { action: PasswordAction }) {
  const { formAction, pending, error, state } = useActionForm<void>(action as never);
  const id = useId(); // one per row: a shared id would point every label at the first field on the page
  return (
    <details className="text-sm">
      <summary className="cursor-pointer underline underline-offset-4">Update app password</summary>
      <form action={formAction} className="mt-2 flex max-w-sm flex-col gap-2">
        <Field name="password" id={`update-password-${id}`} label="New app password" type="password" required autoComplete="new-password" hint="Billfold tests it before replacing the old one." />
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={pending} className="min-h-9">{pending ? "Testing…" : "Test and replace"}</Button>
          {state?.ok && <span role="status" className="text-xs text-muted">Updated.</span>}
        </div>
        {error && <span role="alert" className="text-xs text-danger">{error}</span>}
      </form>
    </details>
  );
}

export function SenderNameForm({ action, current }: { action: PasswordAction; current: string }) {
  const { formAction, pending, error, state } = useActionForm<void>(action as never);
  const id = useId();
  return (
    <details className="text-sm">
      <summary className="cursor-pointer underline underline-offset-4">Name on this account{current ? `: ${current}` : ""}</summary>
      <form action={formAction} className="mt-2 flex max-w-sm flex-col gap-2">
        <Field name="senderName" id={`sender-name-${id}`} label="Name on this account" defaultValue={current} maxLength={80} autoComplete="off"
          hint="Fills {{from_name}} in your email wording, for example the sign-off. Leave empty to use the name of the person pressing Send." />
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={pending} className="min-h-9">{pending ? "Saving…" : "Save name"}</Button>
          {state?.ok && <span role="status" className="text-xs text-muted">Saved.</span>}
        </div>
        {error && <span role="alert" className="text-xs text-danger">{error}</span>}
      </form>
    </details>
  );
}

export function ConnectionRowActions({ test, remove, label, reconnectHref, updatePassword, senderName }: {
  test: TestAction; remove: RemoveAction; label: string; reconnectHref?: string; updatePassword?: PasswordAction; senderName?: { action: PasswordAction; current: string };
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <TestButton action={test} />
        {reconnectHref && <a href={reconnectHref} className="text-sm underline underline-offset-4">Reconnect</a>}
        <RemoveButton action={remove} label={label} />
      </div>
      {updatePassword && <UpdatePasswordForm action={updatePassword} />}
      {senderName && <SenderNameForm action={senderName.action} current={senderName.current} />}
    </div>
  );
}
