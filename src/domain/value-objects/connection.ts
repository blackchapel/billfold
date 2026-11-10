export const CONNECTION_KINDS = ["google_drive", "gmail", "imap", "smtp"] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

export const GOOGLE_KINDS = ["google_drive", "gmail"] as const;
export type GoogleKind = (typeof GOOGLE_KINDS)[number];

export const MAIL_SERVER_KINDS = ["imap", "smtp"] as const;
export type MailServerKind = (typeof MAIL_SERVER_KINDS)[number];

export const CONNECTION_STATUSES = ["active", "needs_attention"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Non-secret settings stored beside a connection (host, port, ...). Secrets live only in the encrypted column. */
export type ConnectionConfig = Record<string, string | number | boolean>;

export function isGoogleKind(kind: string): kind is GoogleKind {
  return (GOOGLE_KINDS as readonly string[]).includes(kind);
}

export function isConnectionKind(kind: string): kind is ConnectionKind {
  return (CONNECTION_KINDS as readonly string[]).includes(kind);
}

/** What each Google connection asks permission for. `openid email` only identifies which account was linked. */
export const GOOGLE_SCOPES: Record<GoogleKind, readonly string[]> = {
  google_drive: ["openid", "email", "https://www.googleapis.com/auth/drive.file"],
  gmail: ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
};
