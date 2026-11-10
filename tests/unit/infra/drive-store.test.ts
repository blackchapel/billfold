import { describe, expect, it } from "vitest";
import { GoogleDriveStore, safeDriveName } from "@/server/infra/providers/drive-store";
import type { GoogleOAuthClient } from "@/domain/ports/services";

const google: GoogleOAuthClient = {
  isConfigured: () => true, authorizeUrl: () => "", exchangeCode: async () => ({ refreshToken: "", accountEmail: "" }),
  accessToken: async (kind, rt) => `${kind}:${rt}`, revoke: async () => undefined,
};

/** A small stand-in for the three Drive calls Billfold makes. It enforces what Drive enforces: parents must exist. */
function fakeDrive(opts: { failUpload?: number; noLink?: boolean } = {}) {
  const folders: { id: string; name: string; parent: string }[] = [];
  const files: { id: string; name: string; parent: string; bytes: Buffer; mime: string }[] = [];
  const queries: string[] = [];
  const auth = new Set<string>();
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = new URL(String(url));
    auth.add((init?.headers as Record<string, string>).authorization ?? "");
    if (u.origin === "https://www.googleapis.com" && u.pathname === "/drive/v3/files" && (init?.method ?? "GET") === "GET") {
      const q = u.searchParams.get("q") ?? "";
      queries.push(q);
      const name = /name = '((?:\\.|[^'\\])*)'/.exec(q)?.[1]?.replace(/\\(.)/g, "$1");
      const parent = /'((?:\\.|[^'\\])*)' in parents/.exec(q)?.[1];
      return Response.json({ files: folders.filter((f) => f.name === name && f.parent === parent).slice(0, 1).map((f) => ({ id: f.id })) });
    }
    if (u.pathname === "/drive/v3/files" && init?.method === "POST") {
      const b = JSON.parse(String(init.body)) as { name: string; parents: string[]; mimeType: string };
      if (b.parents[0] !== "root" && !folders.some((f) => f.id === b.parents[0])) return new Response("{}", { status: 404 });
      const f = { id: `folder-${folders.length + 1}`, name: b.name, parent: b.parents[0] ?? "root" };
      folders.push(f);
      return Response.json({ id: f.id });
    }
    if (u.pathname === "/upload/drive/v3/files") {
      if (opts.failUpload) return new Response("{}", { status: opts.failUpload });
      const body = Buffer.from(init?.body as Uint8Array);
      const boundary = /boundary=(.+)$/.exec((init?.headers as Record<string, string>)["content-type"] ?? "")?.[1] ?? "";
      const text = body.toString("latin1");
      const meta = JSON.parse(/\r\n\r\n(\{.*?\})\r\n--/s.exec(text)?.[1] ?? "{}") as { name: string; parents: string[]; mimeType: string };
      const start = text.indexOf("\r\n\r\n", text.indexOf(`Content-Type: ${meta.mimeType}`)) + 4;
      const end = text.lastIndexOf(`\r\n--${boundary}--`);
      const f = { id: `file-${files.length + 1}`, name: meta.name, parent: meta.parents[0] ?? "", bytes: body.subarray(start, end), mime: meta.mimeType };
      files.push(f);
      return Response.json(opts.noLink ? { id: f.id } : { id: f.id, webViewLink: `https://drive.google.com/file/d/${f.id}/view?usp=drivesdk` });
    }
    return new Response("{}", { status: 400 });
  };
  return { fetchImpl: fetchImpl as unknown as typeof fetch, folders, files, queries, auth };
}

const secretJson = JSON.stringify({ refreshToken: "rt-d" });
const upload = (store: GoogleDriveStore, over: Partial<Parameters<GoogleDriveStore["upload"]>[0]> = {}) =>
  store.upload({ secretJson, folderPath: ["Billfold", "2026-11", "Jio"], fileName: "2026-11 Jio - bill.pdf", bytes: new Uint8Array([0x25, 0x50, 0xff, 0x00, 0x80, 0x0d, 0x0a]), mimeType: "application/pdf", ...over });

describe("GoogleDriveStore", () => {
  it("creates the folder chain, stores the exact bytes in the innermost folder, and returns ids and a link", async () => {
    const d = fakeDrive();
    const out = await upload(new GoogleDriveStore(google, d.fetchImpl));
    expect(d.folders.map((f) => [f.name, f.parent])).toEqual([["Billfold", "root"], ["2026-11", "folder-1"], ["Jio", "folder-2"]]);
    expect(d.files).toHaveLength(1);
    expect(d.files[0]).toMatchObject({ name: "2026-11 Jio - bill.pdf", parent: "folder-3", mime: "application/pdf" });
    expect([...(d.files[0]?.bytes ?? [])]).toEqual([0x25, 0x50, 0xff, 0x00, 0x80, 0x0d, 0x0a]); // binary survives the multipart body
    expect(out).toEqual({ fileId: "file-1", folderId: "folder-3", webViewLink: "https://drive.google.com/file/d/file-1/view?usp=drivesdk" });
    expect([...d.auth]).toEqual(["Bearer google_drive:rt-d"]);
  });
  it("reuses existing folders on the next upload instead of creating duplicates", async () => {
    const d = fakeDrive();
    const store = new GoogleDriveStore(google, d.fetchImpl);
    await upload(store);
    const second = await upload(store, { fileName: "another.pdf" });
    const third = await upload(store, { folderPath: ["Billfold", "2026-11", "Power"] });
    expect(d.folders.map((f) => f.name)).toEqual(["Billfold", "2026-11", "Jio", "Power"]);
    expect(second.folderId).toBe("folder-3");
    expect(third.folderId).toBe("folder-4");
    expect(d.files.map((f) => f.name)).toEqual(["2026-11 Jio - bill.pdf", "another.pdf", "2026-11 Jio - bill.pdf"]);
  });
  it("quotes names safely in the search, and cleans slashes out of names", async () => {
    const d = fakeDrive();
    const store = new GoogleDriveStore(google, d.fetchImpl);
    await upload(store, { folderPath: ["Mom's bills \\ 2026", "a/b"], fileName: "x/y\\z\n.pdf" });
    await upload(store, { folderPath: ["Mom's bills \\ 2026", "a/b"] });
    expect(d.folders.map((f) => f.name)).toEqual(["Mom's bills 2026", "a b"]);
    expect(d.files[0]?.name).toBe("x y z .pdf");
    expect(d.queries[0]).toContain(String.raw`name = 'Mom\'s bills 2026'`);
    expect(d.folders).toHaveLength(2);
    expect(safeDriveName("   ")).toBe("untitled");
    expect(safeDriveName("a".repeat(400))).toHaveLength(150);
  });
  it("falls back to a standard Drive link when the API omits one", async () => {
    const d = fakeDrive({ noLink: true });
    expect((await upload(new GoogleDriveStore(google, d.fetchImpl))).webViewLink).toBe("https://drive.google.com/file/d/file-1/view");
  });
  it("fails with the status, never the response body, and refuses a connection without a token", async () => {
    await expect(upload(new GoogleDriveStore(google, fakeDrive({ failUpload: 403 }).fetchImpl))).rejects.toThrow("Drive request failed: 403");
    await expect(upload(new GoogleDriveStore(google, fakeDrive().fetchImpl), { secretJson: "{}" })).rejects.toThrow(/refresh token/);
  });
});
