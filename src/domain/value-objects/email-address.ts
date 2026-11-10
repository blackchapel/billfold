const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(input: string): string | null {
  const value = input.trim().toLowerCase();
  return EMAIL.test(value) && value.length <= 254 ? value : null;
}
