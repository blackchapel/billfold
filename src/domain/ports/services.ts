import type { ExtractedBill } from "../value-objects/bill-data";
import type { MessageSummary, SourceMatcher } from "../value-objects/source-rules";
import type { ConnectionConfig, ConnectionKind, GoogleKind } from "../value-objects/connection";

export interface SecretBox {
  encrypt(orgId: string, plaintext: string): Promise<string>;
  decrypt(orgId: string, ciphertext: string): Promise<string>;
}

export interface Clock {
  now(): Date;
}

export interface InviteCodeService {
  generate(): { code: string; hash: string };
  hash(code: string): string;
}

export interface RateLimiter {
  /** Returns false when the key has exceeded its allowance. */
  allow(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export interface ProbeResult {
  ok: boolean;
  /** Safe to show to users: never contains a password, token or connection string. */
  message: string;
}

/** Checks that stored credentials still work against the real provider. */
export interface ConnectionProbe {
  check(kind: ConnectionKind, config: ConnectionConfig, secretJson: string): Promise<ProbeResult>;
}

export interface GoogleOAuthClient {
  /** False until the matching Google project's client id and secret are set in the environment. */
  isConfigured(kind: GoogleKind): boolean;
  authorizeUrl(kind: GoogleKind, state: string, redirectUri: string): string;
  exchangeCode(kind: GoogleKind, code: string, redirectUri: string): Promise<{ refreshToken: string; accountEmail: string }>;
  accessToken(kind: GoogleKind, refreshToken: string): Promise<string>;
  /** Tells Google to forget the grant. Best effort: callers must not fail if this does. */
  revoke(kind: GoogleKind, refreshToken: string): Promise<void>;
}

/** Signs short-lived values (OAuth state) so they cannot be forged or replayed after expiry. */
export interface StateSigner {
  sign(payload: Record<string, string | number>, ttlSeconds: number): string;
  verify(token: string): Record<string, string | number> | null;
}

export interface MailSearchInput {
  kind: "gmail" | "imap";
  config: ConnectionConfig;
  secretJson: string;
  matcher: SourceMatcher;
  /** Emails received at or after `since` and before `before`. */
  since: Date;
  before: Date;
  limit: number;
}

/** Looks in a mailbox for emails that could match a source. Callers still run `matchesMessage` on the results. */
export interface MailSearch {
  search(input: MailSearchInput): Promise<MessageSummary[]>;
}

export interface MailFetchInput {
  kind: "gmail" | "imap";
  config: ConnectionConfig;
  secretJson: string;
  messageId: string;
  /** The PDF to download, or null to read only the message itself (for bills that are the email body). */
  attachmentName: string | null;
}

export interface FetchedMessage {
  /** The real subject, which may contain a PDF password. Callers must mask it before storing or showing it. */
  subject: string;
  from: string;
  date: Date;
  attachment: { name: string; bytes: Uint8Array } | null;
  bodyText: string;
}

/** Downloads one email and, if asked, one of its attachments. */
export interface MailFetch {
  fetch(input: MailFetchInput): Promise<FetchedMessage>;
}

export type UnlockResult =
  | { status: "open"; bytes: Uint8Array; wasLocked: boolean }
  | { status: "needs_password" }
  | { status: "wrong_password" }
  | { status: "unreadable" };

export interface PdfTools {
  /** Opens a PDF. Locked files are decrypted with `password`; unlocked files come back untouched. */
  unlock(bytes: Uint8Array, password: string | null): Promise<UnlockResult>;
  /** A simple text-only PDF, for bills that arrive as the email body. */
  textToPdf(input: { title: string; lines: string[] }): Promise<Uint8Array>;
  extractText(bytes: Uint8Array): Promise<string>;
}

export interface BillExtractorInput {
  pdfBytes: Uint8Array;
  text: string;
  hints: { sourceName: string; periodKey: string; currencyCode: string };
}

export interface BillExtractor {
  extract(input: BillExtractorInput): Promise<ExtractedBill>;
}

export interface DriveUploadInput {
  secretJson: string;
  /** Folder names from the top, e.g. ["Billfold", "2026-11", "Jio"]. Missing folders are created. */
  folderPath: string[];
  fileName: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface DriveStore {
  upload(input: DriveUploadInput): Promise<{ fileId: string; folderId: string; webViewLink: string }>;
  /** The bytes of a file Billfold put in Drive earlier. Refuses anything larger than `maxBytes`. */
  download(input: { secretJson: string; fileId: string; maxBytes: number }): Promise<Uint8Array>;
}

export interface OutgoingEmail {
  kind: "gmail" | "smtp";
  config: ConnectionConfig;
  secretJson: string;
  /** The sender's own address (the connected account). */
  from: string;
  fromName: string;
  to: { name: string; email: string };
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; bytes: Uint8Array; contentType: string }[];
}

/** Sends one email through a connected Gmail or SMTP account. Throws when the provider refuses or cannot be reached. */
export interface MailSender {
  send(email: OutgoingEmail): Promise<void>;
}
