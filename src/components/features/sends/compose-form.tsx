"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { SEND_HINTS } from "@/constants/sends";
import { periodLabel } from "@/constants/runs";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";
import type { ComposeOptions, PreviewDto } from "@/types/send";
import { MessageFrame } from "./message-frame";
import { TextLink } from "@/components/features/shell/pending-link";

type Start = (p: ActionState | null, f: FormData) => Promise<ActionState>;
type Preview = (f: FormData) => Promise<ActionState<PreviewDto>>;
const select = "min-h-10 rounded-md border border-line bg-surface px-3 text-sm";

export function ComposeForm({ orgSlug, options, start, preview, initialPeriod }: { orgSlug: string; options: ComposeOptions; start: Start; preview: Preview; initialPeriod: string }) {
  const { formProps, dispatch, pending, error } = useActionForm<void>(start as never);
  const [shown, setShown] = useState<PreviewDto | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const canSend = options.senders.length > 0 && options.periods.length > 0;

  const read = (intent: "send" | "test") => {
    const data = new FormData(formProps.ref.current ?? undefined);
    data.set("intent", intent);
    return data;
  };
  const showPreview = async () => {
    setPreviewing(true);
    setPreviewError(null);
    const res = await preview(read("send"));
    setPreviewing(false);
    if (res.ok) setShown(res.data); else { setShown(null); setPreviewError(res.message); }
  };
  // Anything the person changes makes the shown preview out of date, so it is hidden rather than left to mislead.
  const stale = () => setShown(null);
  const toggle = (id: string) => { setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])); };

  if (!canSend) {
    return (
      <div className="max-w-xl text-sm text-muted">
        {options.periods.length === 0 && <p>There are no bills yet. Run a month on the <TextLink href={`/${orgSlug}/runs`}>Runs</TextLink> page or add one on the <TextLink href={`/${orgSlug}/bills`}>Bills</TextLink> page first.</p>}
        {options.senders.length === 0 && <p className="mt-2">Connect a Gmail account (project B) or an SMTP account to send from on the <TextLink href={`/${orgSlug}/connections`}>Connections</TextLink> page.</p>}
      </div>
    );
  }

  return (
    <form {...formProps} onChange={stale} className="flex max-w-2xl flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="periodKey" className="text-sm font-medium">Month</label>
          <select id="periodKey" name="periodKey" defaultValue={initialPeriod} className={select}>
            {options.periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="templateId" className="text-sm font-medium">Wording</label>
          <select id="templateId" name="templateId" defaultValue="" className={select}>
            <option value="">Default ({options.defaultTemplateName})</option>
            {options.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="connectionId" className="text-sm font-medium">Send from</label>
          <select id="connectionId" name="connectionId" className={select}>
            {options.senders.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.account}){s.healthy ? "" : " – needs attention"}</option>)}
          </select>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Send to</legend>
        {options.recipients.length === 0
          ? <p className="text-sm text-muted">Nobody is on the list yet. Add people on the <TextLink href={`/${orgSlug}/recipients`}>Recipients</TextLink> page. You can still send yourself a test.</p>
          : (
            <ul className="divide-y divide-line border-y border-line">
              {options.recipients.map((r) => (
                <li key={r.id}>
                  <label className="flex min-h-11 items-center gap-3 py-2 text-sm">
                    <input type="checkbox" name="recipientIds" value={r.id} checked={chosen.includes(r.id)} onChange={() => toggle(r.id)} className="size-4 accent-[var(--color-accent)]" />
                    <span>{r.name}<span className="text-muted"> · {r.email}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        <p className="text-xs text-muted">Each person gets their own email. Up to {SEND_HINTS.maxRecipients} at a time.</p>
      </fieldset>

      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="attachPdfs" defaultChecked className="size-4 accent-[var(--color-accent)]" />
        Attach the bill PDFs
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" disabled={previewing || pending} onClick={() => void showPreview()}>{previewing ? "Preparing…" : "Preview the email"}</Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => { if (window.confirm("Send this email to yourself only, to see how it looks in your inbox?")) dispatch(read("test")); }}>Send me a test</Button>
        <Button type="button" disabled={pending || chosen.length === 0}
          onClick={() => { if (window.confirm(`Send this email to ${chosen.length} ${chosen.length === 1 ? "person" : "people"}? Emails cannot be taken back.`)) dispatch(read("send")); }}>
          {pending ? "Starting…" : `Send to ${chosen.length} ${chosen.length === 1 ? "person" : "people"}`}
        </Button>
      </div>
      {error && <FormMessage>{error}</FormMessage>}
      {previewError && <FormMessage>{previewError}</FormMessage>}

      {shown && (
        <section aria-label="Preview" className="flex flex-col gap-3 border-t border-line pt-5">
          <h2 className="font-serif text-2xl">Preview</h2>
          {shown.from && <p className="text-sm"><span className="text-muted">From: </span><span data-testid="preview-from" className="font-medium">{shown.from.name} &lt;{shown.from.address}&gt;</span></p>}
          <p className="text-sm"><span className="text-muted">Subject: </span><span data-testid="preview-subject" className="font-medium">{shown.subject}</span></p>
          <p className="text-xs text-muted">
            {shown.billCount} {shown.billCount === 1 ? "bill" : "bills"} · {shown.totalText} · {shown.templateName}
            {shown.attachments.length > 0 ? ` · ${shown.attachments.length} PDF${shown.attachments.length === 1 ? "" : "s"} attached (${shown.attachmentMegabytes} MB)` : " · no PDFs attached"}
          </p>
          {shown.warnings.map((w) => <p key={w} role="status" className="rounded-md border border-warn px-3 py-2 text-sm text-warn">{w}</p>)}
          <MessageFrame html={shown.html} title="How the email will look" />
        </section>
      )}
    </form>
  );
}
