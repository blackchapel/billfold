import { createHash } from "node:crypto";
import type { Cache } from "@/domain/ports/cache";
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

class DriveHttpError extends Error {
  constructor(readonly status: number) { super(`Drive request failed: ${status}`); }
}

/** Folder ids are forgotten on a Drive 404 (see upload), so they can live long: a trashed or moved folder is found out at the next filing. */
const FOLDER_TTL_SECONDS = 35 * 24 * 3600;

/** "bill.pdf" -> ["bill", ".pdf"]; a name with no extension keeps an empty second part. */
function splitName(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/** The first of "name", "name (2)", "name (3)" ... that is not in `taken`. */
export function freeName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const [stem, ext] = splitName(name);
  for (let i = 2; i < 1000; i++) if (!taken.has(`${stem} (${i})${ext}`)) return `${stem} (${i})${ext}`;
  return `${stem} (${Date.now()})${ext}`;
}

/**
 * Files bills into the connected Google Drive. With full Drive access a folder path such as bills/Oct26 finds the folder that is already
 * there (the oldest, if several share a name) and creates only what is missing; with the older files-only access Billfold can only see
 * folders it made itself. Folder ids are remembered in the shared cache for an hour (one lookup per level per bill otherwise) and
 * forgotten and looked up again if Drive says a remembered folder is gone.
 */
export class GoogleDriveStore implements DriveStore {
  constructor(private readonly google: GoogleOAuthClient, private readonly http: typeof fetch = fetch, private readonly cache: Cache | null = null) {}

  private async session(secretJson: string) {
    const { refreshToken } = JSON.parse(secretJson) as { refreshToken?: string };
    if (!refreshToken) throw new Error("No refresh token");
    const token = await this.google.accessToken("google_drive", refreshToken);
    const call = async <T>(url: string, init: RequestInit = {}): Promise<T> => {
      const res = await this.http(url, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new DriveHttpError(res.status);
      return (await res.json()) as T;
    };
    // Only a fingerprint of the token names the cache entries; the token itself never goes in a key.
    return { call, who: createHash("sha256").update(refreshToken).digest("hex").slice(0, 16) };
  }

  /** The id of the folder at the end of the path, and the cache keys that were relied on to get there. */
  private async folder(call: <T>(url: string, init?: RequestInit) => Promise<T>, who: string, path: string[], useCache: boolean) {
    let parent = "root";
    const relied: string[] = [];
    for (const raw of path) {
      const name = safeDriveName(raw);
      const key = `dfold:${who}:${parent}:${name}`;
      const remembered = useCache && this.cache?.enabled ? await this.cache.get<string>(key) : null;
      if (remembered) { parent = remembered.value; relied.push(key); continue; }
      const q = `name = ${quote(name)} and mimeType = '${FOLDER}' and ${quote(parent)} in parents and trashed = false`;
      const found = await call<{ files?: { id: string }[] }>(`${API}?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1", orderBy: "createdTime", spaces: "drive" })}`);
      parent = found.files?.[0]?.id ?? (await call<{ id: string }>(`${API}?fields=id`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
      })).id;
      if (this.cache?.enabled) await this.cache.set(key, parent, FOLDER_TTL_SECONDS);
    }
    return { parent, relied };
  }

  private async nameFor(call: <T>(url: string, init?: RequestInit) => Promise<T>, parent: string, wanted: string, avoidDuplicate: boolean): Promise<string> {
    const name = safeDriveName(wanted);
    if (!avoidDuplicate) return name;
    const [stem] = splitName(name);
    const q = `name contains ${quote(stem)} and ${quote(parent)} in parents and trashed = false`;
    const found = await call<{ files?: { name: string }[] }>(`${API}?${new URLSearchParams({ q, fields: "files(name)", pageSize: "100", spaces: "drive" })}`);
    return freeName(name, new Set((found.files ?? []).map((f) => f.name)));
  }

  async upload(input: DriveUploadInput) {
    const { call, who } = await this.session(input.secretJson);
    const attempt = async (useCache: boolean) => {
      const { parent, relied } = await this.folder(call, who, input.folderPath, useCache);
      try {
        const name = await this.nameFor(call, parent, input.fileName, input.avoidDuplicate === true);
        const boundary = `billfold-${crypto.randomUUID()}`;
        const metadata = JSON.stringify({ name, parents: [parent], mimeType: input.mimeType });
        const body = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`),
          Buffer.from(input.bytes),
          Buffer.from(`\r\n--${boundary}--`),
        ]);
        const file = await call<{ id: string; webViewLink?: string }>(`${UPLOAD}?uploadType=multipart&fields=id,webViewLink`, {
          method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body,
        });
        return { fileId: file.id, folderId: parent, webViewLink: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`, name };
      } catch (e) {
        // A remembered folder that no longer exists (deleted or moved to the bin): forget it so the next try looks the path up afresh.
        if (e instanceof DriveHttpError && e.status === 404 && relied.length > 0) await this.cache?.del(...relied);
        throw e;
      }
    };
    try {
      return await attempt(true);
    } catch (e) {
      if (e instanceof DriveHttpError && e.status === 404 && this.cache?.enabled) return attempt(false);
      throw e;
    }
  }

  async download(input: { secretJson: string; fileId: string; maxBytes: number }) {
    const { refreshToken } = JSON.parse(input.secretJson) as { refreshToken?: string };
    if (!refreshToken) throw new Error("No refresh token");
    const token = await this.google.accessToken("google_drive", refreshToken);
    const res = await this.http(`${API}/${encodeURIComponent(input.fileId)}?alt=media`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Drive request failed: ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > input.maxBytes) throw new Error("File too large");
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > input.maxBytes) throw new Error("File too large");
    return bytes;
  }
}
