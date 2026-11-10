import type { FetchedMessage, GoogleOAuthClient, MailFetch, MailFetchInput } from "@/domain/ports/services";
import { GmailFetch } from "./gmail-fetch";
import { ImapFetch } from "./imap-fetch";

export class LiveMailFetch implements MailFetch {
  private readonly gmail: GmailFetch;
  private readonly imap = new ImapFetch();

  constructor(google: GoogleOAuthClient, http: typeof fetch = fetch) {
    this.gmail = new GmailFetch(google, http);
  }

  fetch(input: MailFetchInput): Promise<FetchedMessage> {
    return input.kind === "gmail" ? this.gmail.fetch(input) : this.imap.fetch(input);
  }
}
