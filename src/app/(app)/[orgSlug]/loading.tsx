/** Shown the instant a tab is clicked, while the server prepares the page. Also lets Next start the switch immediately. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="max-w-3xl animate-pulse">
      <span className="sr-only">Loading…</span>
      <div className="h-9 w-56 rounded-sm bg-surface" />
      <div className="mt-4 h-4 w-80 max-w-full rounded-sm bg-surface" />
      <div className="mt-8 space-y-3">
        <div className="h-16 rounded-md border border-line bg-surface" />
        <div className="h-16 rounded-md border border-line bg-surface" />
        <div className="h-16 rounded-md border border-line bg-surface" />
      </div>
    </div>
  );
}
