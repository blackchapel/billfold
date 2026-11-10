export const RUN_STATUS_LABELS: Record<string, string> = {
  processing: "In progress",
  completed: "Finished",
  completed_with_errors: "Finished with problems",
  cancelled: "Cancelled",
};

export const ITEM_STATUS_LABELS: Record<string, string> = {
  pending: "Waiting",
  processing: "Filing…",
  done: "Filed",
  failed: "Failed",
  skipped: "Skipped",
};

/** "2026-10" -> "October 2026". Built from the key itself so it never shifts with the viewer's time zone. */
export function periodLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[(month ?? 1) - 1] ?? key} ${year ?? ""}`.trim();
}
