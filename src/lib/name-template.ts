/**
 * File names and folder paths built from a month, a source and the original file name, e.g. "phone-bill_xxxx-{{Mon}}{{yy}}" or
 * "bills/{{Mon}}{{yy}}". Plain find-and-replace: nothing is ever evaluated. Placeholder names are case-sensitive because the case of the
 * name is the case of the result: {{Mon}} gives Oct, {{mon}} gives oct, {{MON}} gives OCT.
 */

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

export interface NameContext {
  /** The month being filed, "2026-10". */
  periodKey: string;
  sourceName: string;
  /** The name the attachment arrived with, without or with ".pdf". Only file names may use it. */
  originalName?: string | null;
}

export const NAME_PLACEHOLDERS = ["Mon", "mon", "MON", "Month", "month", "MONTH", "yy", "year", "yyyy", "mm", "period", "source", "original"] as const;
export type NamePlaceholder = (typeof NAME_PLACEHOLDERS)[number];

export const NAME_PLACEHOLDER_HELP: Record<NamePlaceholder, string> = {
  Mon: "the month in three letters, Oct", mon: "oct (lower case)", MON: "OCT (upper case)",
  Month: "the whole month, October", month: "october (lower case)", MONTH: "OCTOBER (upper case)",
  yy: "the year in two digits, 26", year: "the year, 2026", yyyy: "the year, 2026 (same as year)",
  mm: "the month as a number, 10", period: "year and month, 2026-10",
  source: "the name of the source", original: "the name the attachment arrived with (file names only)",
};

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g;
const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f\u007f]+/g;

function monthParts(periodKey: string): { year: string; month: number } {
  const [year, month] = periodKey.split("-");
  return { year: year ?? "", month: Number(month) };
}

function values(ctx: NameContext): Record<NamePlaceholder, string> {
  const { year, month } = monthParts(ctx.periodKey);
  const short = SHORT[month - 1] ?? "";
  const long = LONG[month - 1] ?? "";
  return {
    Mon: short, mon: short.toLowerCase(), MON: short.toUpperCase(),
    Month: long, month: long.toLowerCase(), MONTH: long.toUpperCase(),
    yy: year.slice(2), year, yyyy: year, mm: String(month).padStart(2, "0"), period: ctx.periodKey,
    source: ctx.sourceName, original: (ctx.originalName ?? "").replace(/\.pdf$/i, ""),
  };
}

/** Placeholders in `text` that are not allowed here (a typo, or {{original}} in a folder), each once, as written. */
export function unknownPlaceholders(text: string, allowed: readonly NamePlaceholder[]): string[] {
  const seen = [...text.matchAll(PLACEHOLDER)].map((m) => m[1] as string);
  return [...new Set(seen.filter((n) => !(allowed as readonly string[]).includes(n)))];
}

/** A stray "{{" or "}}" that never formed a placeholder, which would otherwise end up in a file name. */
const hasLooseBraces = (text: string) => /\{\{|\}\}/.test(text.replace(PLACEHOLDER, ""));

const fill = (text: string, ctx: NameContext): string => {
  const v = values(ctx);
  return text.replace(PLACEHOLDER, (whole, name: string) => (name in v ? v[name as NamePlaceholder] : whole));
};

/** Characters Drive and most systems dislike in a name become spaces; runs of spaces collapse. */
export const cleanName = (text: string): string => text.replace(FORBIDDEN, " ").replace(/\s+/g, " ").trim();

const FILE_PLACEHOLDERS = NAME_PLACEHOLDERS;
const FOLDER_PLACEHOLDERS = NAME_PLACEHOLDERS.filter((p) => p !== "original");

export const NAME_LIMITS = { fileTemplate: 150, folderTemplate: 200, folderDepth: 8, segment: 100 } as const;

/** What is wrong with a file name template, in words for the person typing it, or null when it is fine. */
export function fileTemplateProblem(text: string): string | null {
  if (text.length > NAME_LIMITS.fileTemplate) return `The file name can be at most ${NAME_LIMITS.fileTemplate} characters.`;
  if (/[\\/]/.test(text)) return "A file name cannot contain a slash. Folders are set in the folder path.";
  const unknown = unknownPlaceholders(text, FILE_PLACEHOLDERS);
  if (unknown.length > 0) return `Unknown placeholder${unknown.length > 1 ? "s" : ""}: ${unknown.map((u) => `{{${u}}}`).join(", ")}. Check the spelling and the capital letters against the list.`;
  if (hasLooseBraces(text)) return "A { or } is left over. Placeholders look like {{Mon}}.";
  if (cleanName(text.replace(PLACEHOLDER, "x")).length === 0) return "The file name needs some text or a placeholder.";
  return null;
}

/** What is wrong with a folder path template, or null when it is fine. */
export function folderTemplateProblem(text: string): string | null {
  if (text.length > NAME_LIMITS.folderTemplate) return `The folder path can be at most ${NAME_LIMITS.folderTemplate} characters.`;
  if (text.includes("\\")) return "Use / between folders, not \\.";
  const unknown = unknownPlaceholders(text, FOLDER_PLACEHOLDERS);
  if (unknown.length > 0) return `Unknown placeholder${unknown.length > 1 ? "s" : ""}: ${unknown.map((u) => `{{${u}}}`).join(", ")}. ({{original}} can only be used in the file name.)`;
  if (hasLooseBraces(text)) return "A { or } is left over. Placeholders look like {{Mon}}.";
  const parts = text.split("/").map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 0) return "Enter at least one folder name.";
  if (parts.length > NAME_LIMITS.folderDepth) return `At most ${NAME_LIMITS.folderDepth} folders deep.`;
  if (parts.some((p) => p === "." || p === "..")) return "Folder names cannot be . or ..";
  if (parts.some((p) => p.length > NAME_LIMITS.segment)) return `Each folder name can be at most ${NAME_LIMITS.segment} characters.`;
  return null;
}

/** The file name for one bill. A ".pdf" is added when the template does not end with it. */
export function renderFileName(template: string, ctx: NameContext, extension = ".pdf"): string {
  const base = cleanName(fill(template, ctx)) || "bill";
  return base.toLowerCase().endsWith(extension) ? base : `${base}${extension}`;
}

/** The folders from the top of Drive down to where the bill goes, e.g. ["bills", "Oct26"]. Folders that came out empty are skipped. */
export function renderFolderPath(template: string, ctx: NameContext): string[] {
  return template.split("/").map((p) => cleanName(fill(p, { ...ctx, originalName: null })).slice(0, NAME_LIMITS.segment)).filter((p) => p.length > 0 && p !== "." && p !== "..");
}
