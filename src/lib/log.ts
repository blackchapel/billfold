/** Structured, secret-safe logging for server code. Never pass tokens, passwords or connection strings. */
const URL_LIKE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"']+/gi;

export function safeMessage(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(URL_LIKE, "[url]").slice(0, 300);
}

/** Safe fields describing an error. Drizzle wraps the driver error and its own message embeds the query, so prefer the cause. */
export function errorFields(e: unknown): Record<string, string | null> {
  const cause = e instanceof Error ? e.cause : undefined;
  const root = cause instanceof Error ? cause : e;
  const code = typeof root === "object" && root !== null && "code" in root ? String((root as { code: unknown }).code) : null;
  return { message: cause instanceof Error ? safeMessage(cause) : safeMessage(e).slice(0, 120), code };
}

export function logEvent(event: string, fields: Record<string, string | number | boolean | null> = {}): void {
  console.error(JSON.stringify({ event, ...fields }));
}
