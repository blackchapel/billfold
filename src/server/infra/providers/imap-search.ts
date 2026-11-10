import { ImapFlow, type MessageStructureObject } from "imapflow";
import type { MessageSummary } from "@/domain/value-objects/source-rules";
import type { MailSearchInput } from "@/domain/ports/services";

const TIMEOUT_MS = 15_000;

function attachmentsOf(node: MessageStructureObject | undefined, out: { name: string; size: number }[] = []): { name: string; size: number }[] {
  if (!node) return out;
  const name = node.dispositionParameters?.filename ?? node.parameters?.name;
  if (name && (node.disposition === "attachment" || !node.childNodes)) out.push({ name, size: node.size ?? 0 });
  for (const child of node.childNodes ?? []) attachmentsOf(child, out);
  return out;
}

/** IMAP's text search is a coarse "contains"; domains search by their bare name. Exact matching happens afterwards. */
function criteria(input: MailSearchInput) {
  const from = input.matcher.senders.map((s) => ({ from: s.replace(/^@/, "") }));
  return {
    since: input.since, before: input.before,
    ...(from.length === 1 ? from[0] : { or: from }),
    ...(input.matcher.subjectContains ? { subject: input.matcher.subjectContains } : {}),
  };
}

export class ImapSearch {
  async search(input: MailSearchInput): Promise<MessageSummary[]> {
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
        const found = await client.search(criteria(input) as never, { uid: true });
        const uids = (found || []).slice(-input.limit); // newest first is not guaranteed; the tail is the most recent
        const out: MessageSummary[] = [];
        if (uids.length === 0) return out;
        for await (const m of client.fetch(uids, { uid: true, envelope: true, bodyStructure: true, internalDate: true }, { uid: true })) {
          const from = m.envelope?.from?.[0];
          out.push({
            id: String(m.uid),
            from: from ? `${from.name ?? ""} <${from.address ?? ""}>` : "",
            subject: m.envelope?.subject ?? "",
            date: new Date(m.internalDate ?? m.envelope?.date ?? 0),
            attachments: attachmentsOf(m.bodyStructure),
          });
        }
        return out;
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => client.close());
    }
  }
}
