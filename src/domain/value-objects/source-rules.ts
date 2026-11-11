/** What we know about one email, without its body. Both mailbox kinds are reduced to this. */
export interface MessageSummary {
  id: string;
  from: string;
  subject: string;
  date: Date;
  attachments: { name: string; size: number }[];
}

/** The rules that decide which emails belong to a source. All present rules must hold. */
export interface SourceMatcher {
  /** Full addresses ("billing@jio.com") or whole domains ("@jio.com"). At least one. */
  senders: string[];
  subjectContains: string | null;
  attachmentNameContains: string | null;
  requireAttachment: boolean;
}

const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const DOMAIN = /^@?([a-z0-9-]+(\.[a-z0-9-]+)+)$/;

/** Turns what a person typed into a stored sender rule, or null if it is neither an address nor a domain. */
export function parseSender(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (value.length > 254) return null;
  if (EMAIL.test(value)) return value;
  const domain = DOMAIN.exec(value);
  return domain?.[1] ? `@${domain[1]}` : null;
}

/** "Jio Billing <Bills@Jio.com>" -> "bills@jio.com". */
export function extractAddress(from: string): string {
  const angle = /<([^>]+)>/.exec(from);
  return (angle?.[1] ?? from).trim().toLowerCase();
}

export function senderMatches(rule: string, fromAddress: string): boolean {
  if (!rule.startsWith("@")) return rule === fromAddress;
  const domain = fromAddress.slice(fromAddress.lastIndexOf("@") + 1);
  const wanted = rule.slice(1);
  return domain === wanted || domain.endsWith(`.${wanted}`); // subdomains too: mail.jio.com matches @jio.com
}

const contains = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.toLowerCase());

/** The one definition of "this email belongs to this source", shared by the tester and the pipeline. */
export function matchesMessage(matcher: SourceMatcher, message: MessageSummary): boolean {
  const address = extractAddress(message.from);
  if (!matcher.senders.some((rule) => senderMatches(rule, address))) return false;
  if (matcher.subjectContains && !contains(message.subject, matcher.subjectContains)) return false;
  const files = message.attachments;
  if (matcher.requireAttachment && files.length === 0) return false;
  if (matcher.attachmentNameContains && !files.some((f) => contains(f.name, matcher.attachmentNameContains as string))) return false;
  return true;
}
