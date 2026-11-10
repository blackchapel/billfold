import { MAX_ATTACHMENT_BYTES } from "@/domain/value-objects/bill-data";
import type { FetchedMessage, GoogleOAuthClient, MailFetchInput } from "@/domain/ports/services";
import { htmlToText } from "@/lib/html-text";

const API = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const TIMEOUT_MS = 25_000;
const PART = "mimeType,filename,body(size,attachmentId,data)";
const FIELDS = `id,internalDate,payload(headers(name,value),${PART},parts(${PART},parts(${PART},parts(${PART},parts(${PART})))))`;

interface Part { mimeType?: string; filename?: string; body?: { size?: number; attachmentId?: string; data?: string }; parts?: Part[] }
interface GmailMessage { id: string; internalDate?: string; payload?: Part & { headers?: { name: string; value: string }[] } }

const decode = (data: string) => new Uint8Array(Buffer.from(data, "base64url"));

function walk(part: Part | undefined, visit: (p: Part) => void) {
  if (!part) return;
  visit(part);
  for (const child of part.parts ?? []) walk(child, visit);
}

export class GmailFetch {
  constructor(private readonly google: GoogleOAuthClient, private readonly http: typeof fetch = fetch) {}

  async fetch(input: MailFetchInput): Promise<FetchedMessage> {
    const { refreshToken } = JSON.parse(input.secretJson) as { refreshToken?: string };
    if (!refreshToken) throw new Error("No refresh token");
    const token = await this.google.accessToken("gmail", refreshToken);
    const get = async <T>(url: string): Promise<T> => {
      const res = await this.http(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`Gmail request failed: ${res.status}`);
      return (await res.json()) as T;
    };

    const id = encodeURIComponent(input.messageId);
    const message = await get<GmailMessage>(`${API}/${id}?format=full&fields=${encodeURIComponent(FIELDS)}`);
    const header = (name: string) => message.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";

    let plain = "";
    let html = "";
    let wanted: Part | null = null;
    walk(message.payload, (p) => {
      if (!p.filename && p.body?.data) {
        if (p.mimeType === "text/plain") plain += Buffer.from(p.body.data, "base64url").toString("utf8");
        else if (p.mimeType === "text/html") html += Buffer.from(p.body.data, "base64url").toString("utf8");
      }
      if (input.attachmentName && p.filename === input.attachmentName && !wanted) wanted = p;
    });

    let attachment: FetchedMessage["attachment"] = null;
    if (input.attachmentName) {
      const part = wanted as Part | null;
      if (!part) throw new Error("Attachment not found in the email");
      if ((part.body?.size ?? 0) > MAX_ATTACHMENT_BYTES) throw new Error("Attachment too large");
      const data = part.body?.attachmentId
        ? (await get<{ data?: string }>(`${API}/${id}/attachments/${encodeURIComponent(part.body.attachmentId)}?fields=data`)).data
        : part.body?.data;
      if (!data) throw new Error("Attachment had no content");
      attachment = { name: input.attachmentName, bytes: decode(data) };
    }
    return {
      subject: header("subject"), from: header("from"), date: new Date(Number(message.internalDate ?? Date.parse(header("date")))),
      attachment, bodyText: plain.trim() || htmlToText(html),
    };
  }
}
