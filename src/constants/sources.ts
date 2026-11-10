export const PASSWORD_MODE_OPTIONS = [
  { value: "none", label: "Not password protected" },
  { value: "subject_brackets", label: "Password is in the email subject, in brackets at the end (Jio style)" },
  { value: "subject_pattern", label: "Password is in the email subject, found with a pattern" },
  { value: "static", label: "Same password every time (saved encrypted)" },
] as const;

export const PASSWORD_MODE_LABELS: Record<string, string> = Object.fromEntries(PASSWORD_MODE_OPTIONS.map((o) => [o.value, o.label]));

export const PERIOD_MODE_OPTIONS = [
  { value: "previous_month", label: "Last calendar month" },
  { value: "current_month", label: "This calendar month" },
] as const;

export const PERIOD_MODE_LABELS: Record<string, string> = Object.fromEntries(PERIOD_MODE_OPTIONS.map((o) => [o.value, o.label]));
