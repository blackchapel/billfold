import { ImapFlow, type MessageStructureObject } from "imapflow";
import { MAX_ATTACHMENT_BYTES } from "@/domain/value-objects/bill-data";
import type { FetchedMessage, MailFetchInput } from "@/domain/ports/services";
import { htmlToText } from "@/lib/html-text";

const TIMEOUT_MS = 25_000;

interface Found { part: string; size: number }

function find(node: MessageStructureObject | undefined, test: (n: MessageStructureObject) => boolean): Found | null {
  if (!node) return null;
  if (!node.childNodes && test(node)) return { part: node.part ?? "1", size: node.size ?? 0 };
  for (const child of node.childNodes ?? []) {
    const hit = find(child, test);
    if (hit) return hit;
  }
  return null;
}

async function read(stream: AsyncIterable<Buffer | Uint8Array | string>, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += b.length;
    if (total > limit) throw new Error("Attachment too large");
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

export class ImapFetch {
  async fetch(input: MailFetchInput): Promise<FetchedMessage> {
    const { password } = JSON.parse(input.secretJson) as { password?: string };
    const c = input.config;
    const client = new ImapFlow({
      host: String(c.host), port: Number(c.port), secure: c.secure === true, auth: { user: String(c.username), pass: password ?? "" }, logger: false,
      connectionTimeout: TIMEOUT_MS, greetingTimeout: TIMEOUT_MS, socketTimeout: TIMEOUT_MS,
    });
    client.on("error", () => undefined);
    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX", { readOnly: true });
      try {
        const uid = Number(input.messageId);
        const msg = await client.fetchOne(uid, { uid: true, envelope: true, bodyStructure: true, internalDate: true }, { uid: true });
        if (!msg) throw new Error("Email not found");
        const download = async (part: string, limit: number) => {
          const { content } = await client.download(uid, part, { uid: true, maxBytes: limit + 1 });
          if (!content) throw new Error("The email part had no content");
          return read(content, limit);
        };

        let attachment: FetchedMessage["attachment"] = null;
        if (input.attachmentName) {
          const hit = find(msg.bodyStructure, (n) => (n.dispositionParameters?.filename ?? n.parameters?.name) === input.attachmentName);
          if (!hit) throw new Error("Attachment not found in the email");
          if (hit.size > MAX_ATTACHMENT_BYTES) throw new Error("Attachment too large");
          attachment = { name: input.attachmentName, bytes: new Uint8Array(await download(hit.part, MAX_ATTACHMENT_BYTES)) };
        }
        const textPart = find(msg.bodyStructure, (n) => n.type === "text/plain" && !n.disposition);
        const htmlPart = textPart ? null : find(msg.bodyStructure, (n) => n.type === "text/html" && !n.disposition);
        let bodyText = "";
        if (textPart) bodyText = (await download(textPart.part, 1_000_000)).toString("utf8");
        else if (htmlPart) bodyText = htmlToText((await download(htmlPart.part, 1_000_000)).toString("utf8"));

        const from = msg.envelope?.from?.[0];
        return {
          subject: msg.envelope?.subject ?? "", from: from ? `${from.name ?? ""} <${from.address ?? ""}>` : "",
          date: new Date(msg.internalDate ?? msg.envelope?.date ?? 0), attachment, bodyText,
        };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => client.close());
    }
  }
}
