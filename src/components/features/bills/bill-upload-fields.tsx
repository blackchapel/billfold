"use client";
import { useState } from "react";
import { Field } from "@/components/ui/field";
import { BILL_UPLOAD_ACCEPT, BILL_UPLOAD_MAX_BYTES } from "@/constants/bills";
import { folderTemplateProblem, NAME_PLACEHOLDER_HELP, NAME_PLACEHOLDERS, renderFolderPath } from "@/lib/name-template";
import type { ConnectionOption } from "@/types/source";

/** The optional document on the Add a bill form: the file, which Google Drive and which folder. The file keeps the name it has. */
export function BillUploadFields({ drives, periodKey }: { drives: ConnectionOption[]; periodKey: string }) {
  const [fileName, setFileName] = useState("");
  const [tooBig, setTooBig] = useState(false);
  const [folder, setFolder] = useState("");
  const problem = folder.trim() ? folderTemplateProblem(folder.trim()) : null;
  const usable = drives.filter((d) => d.fullAccess);
  return (
    <fieldset className="flex flex-col gap-4 rounded-md border border-line p-4">
      <legend className="px-1 text-sm font-medium">Attach the document (optional)</legend>
      {drives.length === 0 ? (
        <p className="text-sm text-muted">Connect a Google Drive on the Connections page to attach and file the document.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="file" className="text-sm font-medium">File</label>
            <input id="file" name="file" type="file" accept={BILL_UPLOAD_ACCEPT} className="text-sm file:mr-3 file:min-h-10 file:rounded-md file:border file:border-line file:bg-surface file:px-4 file:text-sm"
              onChange={(e) => { const f = e.target.files?.[0]; setFileName(f?.name ?? ""); setTooBig((f?.size ?? 0) > BILL_UPLOAD_MAX_BYTES); }} />
            <p className="text-xs text-muted">A PDF or a picture (PNG, JPG, WebP) up to {BILL_UPLOAD_MAX_BYTES / 1048576} MB. It is saved in Drive under the name it already has.</p>
            {tooBig && <p role="alert" className="text-xs text-danger">That file is larger than {BILL_UPLOAD_MAX_BYTES / 1048576} MB. Choose a smaller one.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="driveConnectionId" className="text-sm font-medium">Google Drive</label>
            <select id="driveConnectionId" name="driveConnectionId" className="min-h-10 rounded-md border border-line bg-surface px-3 text-sm">
              {drives.map((d) => <option key={d.id} value={d.id}>{d.label} ({d.account}){d.fullAccess ? "" : " – needs more permission"}</option>)}
            </select>
            {usable.length === 0 && <p className="text-xs text-warn">Press Reconnect on the Drive on the Connections page and allow access to your Drive first. Until then a file cannot be saved into your own folders.</p>}
          </div>
          <Field name="folderTemplate" label="Folder" value={folder} onChange={(e) => setFolder(e.target.value)} maxLength={200} placeholder="bills/{{Mon}}{{yy}}"
            error={problem ?? undefined} hint="Folders from the top of your Drive, separated by /. Existing folders are used; missing ones are created. Needed when a file is attached." />
          {fileName && !problem && folder.trim() && (
            <p data-testid="upload-preview" className="break-all rounded-md bg-surface px-3 py-2 font-mono text-[13px]">{renderFolderPath(folder.trim(), { periodKey, sourceName: "Added by hand" }).join(" / ")} / {fileName}</p>
          )}
          <details className="text-xs text-muted">
            <summary className="cursor-pointer underline underline-offset-4">Placeholders you can use in the folder</summary>
            <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {NAME_PLACEHOLDERS.filter((p) => p !== "original").map((p) => <li key={p}><code>{`{{${p}}}`}</code> {NAME_PLACEHOLDER_HELP[p]}</li>)}
            </ul>
          </details>
        </>
      )}
    </fieldset>
  );
}
