/** Structured, secret-safe logging for server code. Never pass tokens, passwords or connection strings. */
const URL_LIKE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"']+/gi;

export function safeMessage(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(URL_LIKE, "[url]").slice(0, 300);
}

export function logEvent(event: string, fields: Record<string, string | number | boolean | null> = {}): void {
  console.error(JSON.stringify({ event, ...fields }));
}
