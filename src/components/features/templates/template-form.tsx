"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";
import type { PlaceholderDto, TemplateDto } from "@/types/send";

type A = (p: ActionState | null, f: FormData) => Promise<ActionState>;
const area = "min-h-24 rounded-md border border-line bg-surface px-3 py-2 text-sm";

export function TemplateForm({ action, template, placeholders, cancelHref }: { action: A; template?: Pick<TemplateDto, "name" | "subject" | "intro" | "signoff">; placeholders: PlaceholderDto[]; cancelHref?: string }) {
  const { formProps, pending, error } = useActionForm<void>(action as never, { resetOnSuccess: !template?.name });
  return (
    <form {...formProps} className="flex max-w-xl flex-col gap-4">
      <Field name="name" label="Template name" required minLength={2} maxLength={60} defaultValue={template?.name} autoComplete="off" />
      <Field name="subject" label="Subject" required maxLength={150} defaultValue={template?.subject} autoComplete="off" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="intro" className="text-sm font-medium">Opening text</label>
        <textarea id="intro" name="intro" maxLength={2000} defaultValue={template?.intro} className={area} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signoff" className="text-sm font-medium">Closing text</label>
        <textarea id="signoff" name="signoff" maxLength={500} defaultValue={template?.signoff} className={`${area} min-h-16`} />
      </div>
      <div className="text-xs text-muted">
        <p>You can use these words between double curly brackets. They are filled in when the email is made:</p>
        <ul className="mt-1 list-disc pl-5">{placeholders.map((p) => <li key={p.name}><code>{`{{${p.name}}}`}</code> – {p.help}</li>)}</ul>
        <p className="mt-1">The table of bills and the list of attached PDFs are added between the opening and closing text.</p>
      </div>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : template?.name ? "Save changes" : "Save template"}</Button>
        {cancelHref && <Link href={cancelHref} className="text-sm underline underline-offset-4">Cancel</Link>}
      </div>
      {error && <FormMessage>{error}</FormMessage>}
    </form>
  );
}
