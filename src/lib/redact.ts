const MASK = "[redacted]";

/** Removes every occurrence of each secret from text, case-sensitively and exactly. */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret || secret.length < 3) continue;
    out = out.split(secret).join(MASK);
  }
  return out;
}

/** Jio-style subjects carry the PDF password in trailing brackets: "E-Bill ... (pass123)". */
export function redactTrailingBracket(subject: string): string {
  return subject.replace(/\s*[[(][^\])]{3,}[\])]\s*$/, ` ${MASK}`).trim();
}

const SENSITIVE_KEY = /pass(word)?|secret|token|credential|authorization|api[-_]?key/i;

export function redactObject<T>(value: T, secrets: readonly string[] = []): T {
  if (typeof value === "string") return redactSecrets(value, secrets) as T;
  if (Array.isArray(value)) return value.map((v) => redactObject(v, secrets)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? MASK : redactObject(v, secrets)]),
    ) as T;
  }
  return value;
}
