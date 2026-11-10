const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,255}\.[A-Za-z]{2,}$/;

/** The address people can write to about privacy or their data, from NEXT_PUBLIC_CONTACT_EMAIL. Null when it is unset or not a plain address. */
export function contactEmail(raw: string | undefined = process.env.NEXT_PUBLIC_CONTACT_EMAIL): string | null {
  const value = raw?.trim() ?? "";
  return EMAIL.test(value) ? value : null;
}
