/** How to open a password-protected bill PDF. */
export const PASSWORD_MODES = ["none", "static", "subject_brackets", "subject_pattern"] as const;
export type PasswordMode = (typeof PASSWORD_MODES)[number];

/** Jio-style subjects end with the password in brackets: "E-Bill for 98xxxx (abc123)". */
export const BRACKET_PATTERN = String.raw`[\[(]([^\])]{3,})[\])]\s*$`;

const MAX_PATTERN = 120;
const MAX_SUBJECT = 500; // longer subjects are cut before matching so a bad pattern cannot run for long

/** Returns a message to show the user if the pattern cannot be used, or null if it is fine. */
export function validatePasswordPattern(pattern: string): string | null {
  if (!pattern.trim()) return "Enter the pattern that finds the password in the subject.";
  if (pattern.length > MAX_PATTERN) return `The pattern can be at most ${MAX_PATTERN} characters.`;
  let groups: number;
  try {
    groups = (new RegExp(`${pattern}|`).exec("")?.length ?? 1) - 1;
  } catch {
    return "That pattern is not valid.";
  }
  if (groups !== 1) return "The pattern needs exactly one pair of brackets ( ) around the password part.";
  if (/\([^)]*[+*][^)]*\)[+*{]/.test(pattern)) return "That pattern is too complicated. Keep repeats simple.";
  return null;
}

function regexFor(mode: PasswordMode, pattern: string | null): RegExp | null {
  const source = mode === "subject_brackets" ? BRACKET_PATTERN : mode === "subject_pattern" ? pattern : null;
  if (!source || (mode === "subject_pattern" && validatePasswordPattern(source))) return null;
  return new RegExp(source, "di");
}

/** The password written in the subject, or null if the mode does not read subjects or nothing matched. */
export function extractSubjectPassword(mode: PasswordMode, pattern: string | null, subject: string): string | null {
  const match = regexFor(mode, pattern)?.exec(subject.slice(0, MAX_SUBJECT));
  return match?.[1] ?? null;
}

/** The subject with the password part masked, safe to store, log and show. */
export function redactSubjectPassword(mode: PasswordMode, pattern: string | null, subject: string): string {
  const text = subject.slice(0, MAX_SUBJECT);
  const indices = (regexFor(mode, pattern)?.exec(text) as (RegExpExecArray & { indices?: [number, number][] }) | null | undefined)?.indices?.[1];
  return indices ? `${text.slice(0, indices[0])}[redacted]${text.slice(indices[1])}` : text;
}
