import type { ConnectionConfig, ConnectionKind, GoogleKind } from "@/domain/value-objects/connection";
import type { MessageSummary } from "@/domain/value-objects/source-rules";
import type { ConnectionProbe, DriveStore, DriveUploadInput, FetchedMessage, GoogleOAuthClient, MailFetch, MailFetchInput, MailSearch, MailSearchInput, ProbeResult } from "@/domain/ports/services";
import { withinWindow } from "./mail-search";

/** Offline stand-ins used only when test mode is on (never in production), so Playwright can run without Google or mail servers. */
export const TEST_GOOD_PASSWORD = "good-app-password";

export class StubConnectionProbe implements ConnectionProbe {
  async check(_kind: ConnectionKind, _config: ConnectionConfig, secretJson: string): Promise<ProbeResult> {
    const secret = JSON.parse(secretJson) as { password?: string; refreshToken?: string };
    if (secret.refreshToken === "test-refresh" || secret.password === TEST_GOOD_PASSWORD) return { ok: true, message: "Test mode: connection is fine." };
    return { ok: false, message: "The server rejected the username or app password." };
  }
}

/** The "Google consent screen" is the callback itself, so the whole state/cookie round trip is still exercised. */
export class StubGoogleOAuth implements GoogleOAuthClient {
  revoked: string[] = [];
  isConfigured() { return true; }
  authorizeUrl(kind: GoogleKind, state: string, redirectUri: string) {
    return `${redirectUri}?code=test-${kind}&state=${encodeURIComponent(state)}`;
  }
  async exchangeCode(kind: GoogleKind) {
    return { refreshToken: "test-refresh", accountEmail: `${kind === "gmail" ? "mailbox" : "drive"}@example.com` };
  }
  async accessToken() { return "test-access"; }
  async revoke(_kind: GoogleKind, refreshToken: string) { this.revoked.push(refreshToken); }
}

/** A tiny fake mailbox: one Jio-style bill with the password in the subject, one electricity bill, one newsletter. */
export class StubMailSearch implements MailSearch {
  async search(input: MailSearchInput): Promise<MessageSummary[]> {
    const daysAgo = (n: number) => new Date(input.before.getTime() - n * 86_400_000);
    const all: MessageSummary[] = [
      { id: "1", from: "Jio Billing <billing@jio.com>", subject: "Your Jio bill is ready (abc123)", date: daysAgo(5), attachments: [{ name: "jio-bill.pdf", size: 52_000 }] },
      { id: "2", from: "Power Co <noreply@powerco.example>", subject: "Electricity bill November", date: daysAgo(9), attachments: [{ name: "bill-nov.pdf", size: 31_000 }] },
      { id: "3", from: "News <news@powerco.example>", subject: "Our newsletter", date: daysAgo(12), attachments: [] },
      { id: "5", from: "Bank <statements@bank.example>", subject: "Your statement", date: daysAgo(15), attachments: [{ name: "statement.pdf", size: 40_000 }] },
      { id: "6", from: "Scans <scan@scanco.example>", subject: "Scanned statement", date: daysAgo(18), attachments: [{ name: "scan.pdf", size: 90_000 }] },
    ];
    return withinWindow(all, input.since, input.before);
  }
}

/** Bills the stub mailbox "contains": what the fetch returns for each message id that StubMailSearch lists. */
export const TEST_JIO_PASSWORD = "abc123";
export const TEST_BANK_PASSWORD = "bank-pass-1";

async function billPdf(lines: string[], password?: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  lines.forEach((line, i) => page.drawText(line, { x: 20, y: 250 - i * 22, size: 12, font }));
  if (password) doc.encrypt({ userPassword: password, ownerPassword: `${password}-owner`, permissions: {} });
  return doc.save();
}

export class StubMailFetch implements MailFetch {
  async fetch(input: MailFetchInput): Promise<FetchedMessage> {
    const date = new Date();
    switch (input.messageId) {
      case "1":
        return { subject: `Your Jio bill is ready (${TEST_JIO_PASSWORD})`, from: "Jio Billing <billing@jio.com>", date, bodyText: "", attachment: input.attachmentName
          ? { name: input.attachmentName, bytes: await billPdf(["Jio Bill", "Total amount due: Rs 1,234.50", "Due date: 15/12/2026"], TEST_JIO_PASSWORD) } : null };
      case "2":
        return { subject: "Electricity bill November", from: "Power Co <noreply@powerco.example>", date, bodyText: "", attachment: input.attachmentName
          ? { name: input.attachmentName, bytes: await billPdf(["Power Co", "Amount payable: Rs 2,310.00", "Due date: 20 Dec 2026"]) } : null };
      case "3":
        return { subject: "Our newsletter", from: "News <news@powerco.example>", date, attachment: null, bodyText: "Hello!\nTotal amount due: Rs 99.00\nThanks" };
      case "5":
        return { subject: "Your statement", from: "Bank <statements@bank.example>", date, bodyText: "", attachment: input.attachmentName
          ? { name: input.attachmentName, bytes: await billPdf(["Bank statement", "Total amount due: Rs 5,000.00"], TEST_BANK_PASSWORD) } : null };
      case "6": {
        // A scan: a page with no text at all, so the reader finds no amount and the bill is flagged for a person to check.
        const { PDFDocument } = await import("@cantoo/pdf-lib");
        const doc = await PDFDocument.create();
        doc.addPage([400, 300]);
        return { subject: "Scanned statement", from: "Scans <scan@scanco.example>", date, bodyText: "", attachment: input.attachmentName ? { name: input.attachmentName, bytes: await doc.save() } : null };
      }
      default:
        throw new Error("No such email in the stub mailbox");
    }
  }
}

/** Keeps "uploads" in memory and hands back believable ids and links. Never touches a real Drive. */
export class StubDriveStore implements DriveStore {
  readonly uploads: { folderPath: string[]; fileName: string; size: number }[] = [];
  async upload(input: DriveUploadInput) {
    this.uploads.push({ folderPath: input.folderPath, fileName: input.fileName, size: input.bytes.byteLength });
    const id = `test-file-${this.uploads.length}`;
    return { fileId: id, folderId: `test-folder-${input.folderPath.join("-")}`, webViewLink: `https://drive.test/file/${id}` };
  }
}
