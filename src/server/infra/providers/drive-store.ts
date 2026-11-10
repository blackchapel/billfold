import type { DriveStore, DriveUploadInput, GoogleOAuthClient } from "@/domain/ports/services";

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
const TIMEOUT_MS = 40_000;

/** Drive file names can hold most characters, but slashes and control characters make confusing names. */
export function safeDriveName(name: string): string {
  return name.replace(/[\\/\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150) || "untitled";
}

const quote = (value: string) => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/**
 * Files bills into the connected Google Drive. With the `drive.file` scope Billfold only ever sees what it created itself,
 * so "find the folder" means "find Billfold's own folder": a folder you made by hand with the same name is left alone.
 */
export class GoogleDriveStore implements DriveStore {
  constructor(private readonly google: GoogleOAuthClient, private readonly http: typeof fetch = fetch) {}

  async upload(input: DriveUploadInput) {
    const { refreshToken } = JSON.parse(input.secretJson) as { refreshToken?: string };
    if (!refreshToken) throw new Error("No refresh token");
    const token = await this.google.accessToken("google_drive", refreshToken);
    const call = async <T>(url: string, init: RequestInit = {}): Promise<T> => {
      const res = await this.http(url, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`Drive request failed: ${res.status}`);
      return (await res.json()) as T;
    };

    let parent = "root";
    for (const raw of input.folderPath) {
      const name = safeDriveName(raw);
      const q = `name = ${quote(name)} and mimeType = '${FOLDER}' and ${quote(parent)} in parents and trashed = false`;
      const found = await call<{ files?: { id: string }[] }>(`${API}?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1", spaces: "drive" })}`);
      const existing = found.files?.[0]?.id;
      parent = existing ?? (await call<{ id: string }>(`${API}?fields=id`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
      })).id;
    }

    const boundary = `billfold-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({ name: safeDriveName(input.fileName), parents: [parent], mimeType: input.mimeType });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`),
      Buffer.from(input.bytes),
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const file = await call<{ id: string; webViewLink?: string }>(`${UPLOAD}?uploadType=multipart&fields=id,webViewLink`, {
      method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body,
    });
    return { fileId: file.id, folderId: parent, webViewLink: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view` };
  }
}
