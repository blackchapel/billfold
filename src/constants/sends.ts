export const SEND_STATUS_LABELS: Record<string, string> = {
  sending: "Sending",
  sent: "Sent",
  sent_with_errors: "Sent with problems",
  failed: "Not sent",
  cancelled: "Cancelled",
};

export const SEND_ITEM_STATUS_LABELS: Record<string, string> = {
  pending: "Waiting",
  processing: "Sending…",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
};

/** Mirrors SEND_LIMITS in the domain, for hints on screen. The server enforces the real limits. */
export const SEND_HINTS = { maxRecipients: 25, sendsPerHour: 10 } as const;
