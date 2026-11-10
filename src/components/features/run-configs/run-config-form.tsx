"use client";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { PERIOD_MODE_OPTIONS } from "@/constants/sources";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";
import type { ConnectionOption, RunConfigDto } from "@/types/source";

type SaveAction = (p: ActionState | null, f: FormData) => Promise<ActionState>;

export function RunConfigForm({ action, drives, sources, initial }: {
  action: SaveAction; drives: ConnectionOption[]; sources: { id: string; name: string }[]; initial?: RunConfigDto;
}) {
  const { formProps, pending, error } = useActionForm<void>(action as never);
  return (
    <form {...formProps} className="flex max-w-2xl flex-col gap-5">
      <Field name="name" label="Name" defaultValue={initial?.name} required minLength={2} maxLength={60} placeholder="Monthly household bills" />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Sources to collect</legend>
        {sources.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="sourceIds" value={s.id} defaultChecked={initial?.sourceIds.includes(s.id)} /> {s.name}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="driveConnectionId" className="text-sm font-medium">File the PDFs in this Google Drive</label>
        <select id="driveConnectionId" name="driveConnectionId" required defaultValue={initial?.driveConnectionId ?? ""} className="min-h-10 rounded-md border border-line bg-surface px-3 text-sm">
          <option value="" disabled>Choose a Drive</option>
          {drives.map((d) => <option key={d.id} value={d.id}>{d.label}{d.label !== d.account ? ` (${d.account})` : ""}</option>)}
        </select>
      </div>
      <Field name="driveFolder" label="Drive folder name" defaultValue={initial?.driveFolder ?? "Billfold"} required maxLength={100}
        hint="Billfold creates this folder in that Drive and files each month's bills inside it." />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Which month does a run cover by default?</legend>
        {PERIOD_MODE_OPTIONS.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <input type="radio" name="periodMode" value={o.value} defaultChecked={(initial?.periodMode ?? "previous_month") === o.value} /> {o.label}
          </label>
        ))}
      </fieldset>
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save run configuration"}</Button></div>
      {error && <FormMessage>{error}</FormMessage>}
    </form>
  );
}
