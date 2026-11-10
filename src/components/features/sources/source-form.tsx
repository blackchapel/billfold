"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { PASSWORD_MODE_OPTIONS } from "@/constants/sources";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";
import type { ConnectionOption, SourceDto, TesterDto } from "@/types/source";
import { TestResults } from "./test-results";

type SaveAction = (p: ActionState | null, f: FormData) => Promise<ActionState>;
type TestAction = (p: ActionState<TesterDto> | null, f: FormData) => Promise<ActionState<TesterDto>>;

export function SourceForm({ action, testAction, mailboxes, initial }: { action: SaveAction; testAction: TestAction; mailboxes: ConnectionOption[]; initial?: SourceDto }) {
  const save = useActionForm<void>(action as never);
  const test = useActionForm<TesterDto>(testAction);
  const [mode, setMode] = useState(initial?.passwordMode ?? "none");
  const inSubject = mode === "subject_brackets" || mode === "subject_pattern";
  // One form, two buttons: "Test" runs the dry run, anything else saves. Neither clears what was typed.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    (submitter?.getAttribute("data-intent") === "test" ? test : save).dispatch(new FormData(e.currentTarget));
  };

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-5">
      <Field name="name" label="Name" defaultValue={initial?.name} required minLength={2} maxLength={60} placeholder="Jio mobile bill" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="connectionId" className="text-sm font-medium">Read from mailbox</label>
        <select id="connectionId" name="connectionId" required defaultValue={initial?.connectionId ?? ""} className="min-h-10 rounded-md border border-line bg-surface px-3 text-sm">
          <option value="" disabled>Choose a mailbox</option>
          {mailboxes.map((c) => <option key={c.id} value={c.id}>{c.label}{c.label !== c.account ? ` (${c.account})` : ""}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="senders" className="text-sm font-medium">Sent by</label>
        <textarea id="senders" name="senders" required rows={3} defaultValue={initial?.senders.join("\n")} aria-describedby="senders-hint"
          placeholder={"billing@jio.com\nairtel.in"} className="rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm placeholder:text-muted" />
        <p id="senders-hint" className="text-xs text-muted">One per line. An email address, or a whole domain such as jio.com (also matches mail.jio.com).</p>
      </div>
      <Field name="subjectContains" label="Subject contains (optional)" defaultValue={initial?.subjectContains ?? ""} maxLength={100} placeholder="bill" />
      <Field name="attachmentNameContains" label="Attachment name contains (optional)" defaultValue={initial?.attachmentNameContains ?? ""} maxLength={60} placeholder=".pdf" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requireAttachment" defaultChecked={initial?.requireAttachment ?? true} /> Only emails that have an attachment</label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">How is the PDF locked?</legend>
        {PASSWORD_MODE_OPTIONS.map((o) => (
          <label key={o.value} className="flex items-start gap-2 text-sm">
            <input type="radio" name="passwordMode" value={o.value} checked={mode === o.value} onChange={() => setMode(o.value)} className="mt-1" /> {o.label}
          </label>
        ))}
      </fieldset>
      {mode === "subject_pattern" && (
        <Field name="passwordPattern" label="Pattern" defaultValue={initial?.passwordPattern ?? ""} required maxLength={120} className="font-mono" placeholder={"password:\\s*(\\S+)"}
          hint="A regular expression with exactly one pair of brackets ( ) around the password part." />
      )}
      {mode === "static" && (
        <Field name="staticPassword" label="PDF password" type="password" autoComplete="new-password" required={!initial?.hasStaticPassword}
          placeholder={initial?.hasStaticPassword ? "Saved. Type a new one to replace it." : ""} hint="Saved encrypted. It is never shown again." />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={save.pending}>{save.pending ? "Saving…" : "Save source"}</Button>
        <Button type="submit" variant="secondary" data-intent="test" disabled={test.pending}>{test.pending ? "Looking in the mailbox…" : "Test against mailbox"}</Button>
      </div>
      {save.error && <FormMessage>{save.error}</FormMessage>}
      {test.error && <FormMessage>{test.error}</FormMessage>}
      {test.data && <TestResults result={test.data} passwordInSubject={inSubject} />}
    </form>
  );
}
