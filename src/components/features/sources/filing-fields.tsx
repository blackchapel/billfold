"use client";
import { useState } from "react";
import { Field } from "@/components/ui/field";
import { fileTemplateProblem, folderTemplateProblem, NAME_PLACEHOLDERS, NAME_PLACEHOLDER_HELP, renderFileName, renderFolderPath } from "@/lib/name-template";

/** The month an example is shown for: last month in India time, which is what a run normally collects. */
function exampleMonth(): string {
  const d = new Date(Date.now() + 5.5 * 3_600_000);
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Where and under what name this source's PDFs are filed, with a live preview of what the templates make. */
export function FilingFields({ sourceName, initialFile, initialFolder }: { sourceName: string; initialFile: string; initialFolder: string }) {
  const [file, setFile] = useState(initialFile);
  const [folder, setFolder] = useState(initialFolder);
  const ctx = { periodKey: exampleMonth(), sourceName: sourceName.trim() || "Your source", originalName: "statement-4411.pdf" };
  const fileProblem = file.trim() ? fileTemplateProblem(file.trim()) : null;
  const folderProblem = folder.trim() ? folderTemplateProblem(folder.trim()) : null;
  return (
    <fieldset className="flex flex-col gap-4 rounded-md border border-line p-4">
      <legend className="px-1 text-sm font-medium">Where the PDFs go (optional)</legend>
      <Field name="folderTemplate" label="Folder path" value={folder} onChange={(e) => setFolder(e.target.value)} maxLength={200} placeholder="bills/{{Mon}}{{yy}}"
        error={folderProblem ?? undefined} hint="Folders from the top of your Google Drive, separated by /. Folders that already exist are used; missing ones are created. Leave empty for the standard Billfold layout." />
      <Field name="fileNameTemplate" label="File name" value={file} onChange={(e) => setFile(e.target.value)} maxLength={150} placeholder="phone-bill_xxxx-{{Mon}}{{yy}}"
        error={fileProblem ?? undefined} hint="Add .pdf or leave it off. Leave empty to keep the name the email's attachment arrived with." />
      <div aria-live="polite" className="rounded-md bg-surface px-3 py-2 text-sm">
        <p className="text-xs uppercase tracking-wide text-muted">Example for {ctx.periodKey}</p>
        {folderProblem || fileProblem ? <p className="mt-1 text-muted">Fix the problem above to see an example.</p> : (
          <p data-testid="filing-preview" className="mt-1 break-all font-mono text-[13px]">
            {folder.trim() ? renderFolderPath(folder.trim(), ctx).join(" / ") : `Billfold / ${ctx.periodKey} / ${ctx.sourceName}`}
            {" / "}
            {file.trim() ? renderFileName(file.trim(), ctx) : `${ctx.periodKey} ${ctx.sourceName} - statement-4411.pdf`}
          </p>
        )}
      </div>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer underline underline-offset-4">Placeholders you can use</summary>
        <p className="mt-2">Capital letters matter: the case you type is the case you get.</p>
        <ul className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {NAME_PLACEHOLDERS.map((p) => <li key={p}><code>{`{{${p}}}`}</code> {NAME_PLACEHOLDER_HELP[p]}</li>)}
        </ul>
      </details>
    </fieldset>
  );
}
