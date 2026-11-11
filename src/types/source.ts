/** What the UI may know about a source. The static password is never part of it, only whether one is saved. */
export interface SourceDto {
  id: string;
  name: string;
  connectionId: string;
  connectionLabel: string;
  senders: string[];
  subjectContains: string | null;
  attachmentNameContains: string | null;
  requireAttachment: boolean;
  passwordMode: string;
  passwordPattern: string | null;
  hasStaticPassword: boolean;
  fileNameTemplate: string | null;
  folderTemplate: string | null;
}

export interface ConnectionOption { id: string; label: string; account: string; /** Drive only: false for a connection made before full access was asked for. */ fullAccess?: boolean }

export interface RunConfigDto {
  id: string;
  name: string;
  driveConnectionId: string;
  driveLabel: string;
  driveFolder: string;
  periodMode: string;
  sourceIds: string[];
  sourceNames: string[];
}

export interface TesterDto {
  windowDays: number;
  scanned: number;
  matches: { from: string; subject: string; date: string; attachments: string[]; passwordFound: boolean | null }[];
}
