"use client";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";

type Action = (p: ActionState | null) => Promise<ActionState>;

/** What the dialog offers: both choices (a bill that came from an email), just delete (typed in by hand), or just "file it again" (an already deleted bill). */
export type DeleteMode = "choose" | "plain" | "refile-only";

interface Props {
  mode: DeleteMode;
  biller: string;
  month: string;
  /** Server actions, already bound to this bill by the page. */
  hide: Action;
  refile: Action;
}

/** One choice in the dialog: a button that runs its server action, with a plain sentence saying what it does. */
function Choice({ action, label, busyLabel, description, onDone }: { action: Action; label: string; busyLabel: string; description: string; onDone: () => void }) {
  const { formAction, pending, error, state } = useActionForm<void>(((p: ActionState | null) => action(p)) as never);
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <Button type="submit" variant="danger" disabled={pending} className="w-full justify-start text-left">{pending ? busyLabel : label}</Button>
      <p className="text-xs leading-5 text-muted">{description}</p>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </form>
  );
}

/**
 * Pressing Delete asks what the person means, because there are two different things to do with a bill that came from an email:
 * hide it and never file that email again, or remove it for good so the next run files it again.
 */
export function DeleteBillDialog({ mode, biller, month, hide, refile }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = () => ref.current?.close();
  const refileOnly = mode === "refile-only";
  return (
    <>
      <Button type="button" variant={refileOnly ? "secondary" : "danger"} className="min-h-9 px-3" onClick={() => ref.current?.showModal()}>
        {refileOnly ? "Remove and file again" : "Delete"}
      </Button>
      <dialog ref={ref} aria-labelledby={titleId} onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-md border border-line bg-paper p-6 text-ink backdrop:bg-black/40">
        <h2 id={titleId} className="font-serif text-2xl">{refileOnly ? "File this email again?" : "Delete this bill?"}</h2>
        <p className="mt-1 text-sm text-muted">{biller} · {month}</p>
        <div className="mt-5 flex flex-col gap-5">
          {!refileOnly && (
            <Choice action={hide} onDone={close}
              label={mode === "plain" ? "Delete this bill" : "Delete and don't file it again"} busyLabel="Deleting…"
              description={mode === "plain"
                ? "Hides the bill from lists and reports. You can restore it from the Deleted list."
                : "Hides the bill from lists and reports. Billfold remembers this email and skips it in future runs. You can restore it from the Deleted list."} />
          )}
          {mode !== "plain" && (
            <Choice action={refile} onDone={close}
              label={refileOnly ? "Remove and file it again" : "Delete and file it again next run"} busyLabel="Removing…"
              description="Removes the bill for good and forgets the email, so the next run files it again. The PDF already in Google Drive stays where it is, so you will get a second copy." />
          )}
        </div>
        <div className="mt-6 border-t border-line pt-4">
          <Button type="button" variant="secondary" autoFocus onClick={close}>{refileOnly ? "Cancel" : "Keep the bill"}</Button>
        </div>
      </dialog>
    </>
  );
}
