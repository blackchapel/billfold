import type { MessageSummary } from "@/domain/value-objects/source-rules";
import type { GoogleOAuthClient, MailSearch, MailSearchInput } from "@/domain/ports/services";
import { GmailSearch } from "./gmail-search";
import { ImapSearch } from "./imap-search";

/** Providers narrow by day or by search words; this makes the time window exact. */
export function withinWindow(messages: MessageSummary[], since: Date, before: Date): MessageSummary[] {
  return messages.filter((m) => m.date >= since && m.date < before);
}

/** Picks the Gmail or IMAP searcher for the connection and keeps the result inside the requested window. */
export class LiveMailSearch implements MailSearch {
  private readonly gmail: GmailSearch;
  private readonly imap = new ImapSearch();

  constructor(google: GoogleOAuthClient, http: typeof fetch = fetch) {
    this.gmail = new GmailSearch(google, http);
  }

  async search(input: MailSearchInput): Promise<MessageSummary[]> {
    const found = input.kind === "gmail" ? await this.gmail.search(input) : await this.imap.search(input);
    return withinWindow(found, input.since, input.before);
  }
}
