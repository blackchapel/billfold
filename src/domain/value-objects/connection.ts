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
export const FULL_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

export const GOOGLE_SCOPES: Record<GoogleKind, readonly string[]> = {
  // Full Drive access (not just files Billfold made), so bills can go into folders that already exist.
  google_drive: ["openid", "email", FULL_DRIVE_SCOPE],
  gmail: ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
};

/**
 * What the Drive connection was actually allowed to do, from the scopes Google says it granted: "full" can see and use any folder,
 * "files" (every connection made before full access was asked for) can only see what Billfold itself created.
 */
export function driveAccessFromScopes(scopes: readonly string[]): "full" | "files" {
  return scopes.includes(FULL_DRIVE_SCOPE) ? "full" : "files";
}

export const hasFullDriveAccess = (config: ConnectionConfig) => config.driveAccess === "full";
