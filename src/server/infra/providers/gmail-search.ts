import type { MessageSummary } from "@/domain/value-objects/source-rules";
import type { GoogleOAuthClient, MailSearchInput } from "@/domain/ports/services";

const API = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const TIMEOUT_MS = 15_000;
const BATCH = 5;
// Metadata and part names only: no bodies and no attachment bytes are requested.
const FIELDS = "id,internalDate,payload(headers(name,value),filename,body/size,parts(filename,body/size,parts(filename,body/size,parts(filename,body/size))))";

interface Part { filename?: string; body?: { size?: number }; parts?: Part[] }
interface GmailMessage { id: string; internalDate?: string; payload?: Part & { headers?: { name: string; value: string }[] } }

/** Gmail's search language, narrowed by the source rules. Final matching still happens in `matchesMessage`. */
export function buildGmailQuery(input: Pick<MailSearchInput, "matcher" | "since" | "before">): string {
  const parts = [`from:(${input.matcher.senders.join(" OR ")})`];
  if (input.matcher.subjectContains) parts.push(`subject:"${input.matcher.subjectContains.replace(/["\\]/g, " ")}"`);
  if (input.matcher.requireAttachment) parts.push("has:attachment");
  parts.push(`after:${Math.floor(input.since.getTime() / 1000)}`, `before:${Math.floor(input.before.getTime() / 1000)}`);
  return parts.join(" ");
}

function attachmentsOf(part: Part | undefined, out: { name: string; size: number }[] = []): { name: string; size: number }[] {
  if (!part) return out;
  if (part.filename) out.push({ name: part.filename, size: part.body?.size ?? 0 });
  for (const child of part.parts ?? []) attachmentsOf(child, out);
  return out;
}

export class GmailSearch {
  constructor(private readonly google: GoogleOAuthClient, private readonly http: typeof fetch = fetch) {}

  async search(input: MailSearchInput): Promise<MessageSummary[]> {
    const { refreshToken } = JSON.parse(input.secretJson) as { refreshToken?: string };
    if (!refreshToken) throw new Error("No refresh token");
    const token = await this.google.accessToken("gmail", refreshToken);
    const get = async <T>(url: string): Promise<T> => {
      const res = await this.http(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`Gmail request failed: ${res.status}`);
      return (await res.json()) as T;
    };
    const query = new URLSearchParams({ q: buildGmailQuery(input), maxResults: String(Math.min(input.limit, 100)) });
    const list = await get<{ messages?: { id: string }[] }>(`${API}?${query.toString()}`);
    const ids = (list.messages ?? []).map((m) => m.id);

    const out: MessageSummary[] = [];
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = await Promise.all(ids.slice(i, i + BATCH).map((id) => get<GmailMessage>(`${API}/${id}?format=full&fields=${encodeURIComponent(FIELDS)}`)));
      for (const m of batch) {
        const header = (name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
        out.push({
          id: m.id, from: header("from"), subject: header("subject"),
          date: new Date(Number(m.internalDate ?? Date.parse(header("date")))), attachments: attachmentsOf(m.payload),
        });
      }
    }
    return out;
  }
}
