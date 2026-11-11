const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,255}\.[A-Za-z]{2,}$/;

/** The address people can write to about privacy or their data, from NEXT_PUBLIC_CONTACT_EMAIL. Null when it is unset or not a plain address. */
export function contactEmail(raw: string | undefined = process.env.NEXT_PUBLIC_CONTACT_EMAIL): string | null {
  const value = raw?.trim() ?? "";
  return EMAIL.test(value) ? value : null;
}

const NAME = /^[\p{L}\p{N} .,'&-]{2,80}$/u;

/** Who runs this copy of Billfold, from NEXT_PUBLIC_OPERATOR_NAME, shown on the legal pages. Null when unset or odd-looking. */
export function operatorName(raw: string | undefined = process.env.NEXT_PUBLIC_OPERATOR_NAME): string | null {
  const value = raw?.trim() ?? "";
  return NAME.test(value) ? value : null;
}

/** The address people use to reach this copy, e.g. "billfold.example.com", from NEXT_PUBLIC_APP_URL. Null when it is not a real address. */
export function appHost(raw: string | undefined = process.env.NEXT_PUBLIC_APP_URL): string | null {
  try {
    const url = new URL(raw ?? "");
    return url.protocol === "https:" && url.hostname.includes(".") ? url.hostname : null;
  } catch {
    return null;
  }
}
