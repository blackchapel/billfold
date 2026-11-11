/**
 * What a page looks like while the server prepares it, shown the moment a link is pressed. Every grey bar is a `.skeleton` with its own
 * highlight sweeping left to right inside it (see globals.css); bars are shaped and sized like the content they stand in for.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="max-w-3xl">
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

/** One bar. `className` carries its size and its corner radius, matching what it stands in for. */
const Bar = ({ className }: { className: string }) => <div aria-hidden="true" className={`skeleton ${className}`} />;

/** A page title and the line or two of text under it. */
function Heading() {
  return (
    <div className="flex flex-col gap-3">
      <Bar className="h-9 w-56 max-w-full rounded-sm" />
      <div className="flex flex-col gap-2">
        <Bar className="h-3.5 w-full max-w-md rounded-sm" />
        <Bar className="h-3.5 w-2/3 max-w-xs rounded-sm" />
      </div>
    </div>
  );
}

/** Pages that are a heading, a button and a list: Sources, Runs, Bills, Members ... */
export function ListSkeleton() {
  return (
    <Frame>
      <Heading />
      <Bar className="mt-6 h-10 w-36 rounded-md" />
      <div className="mt-8 divide-y divide-line border-y border-line">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-start justify-between gap-4 py-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Bar className={`h-4 max-w-full rounded-sm ${["w-48", "w-56", "w-40", "w-52"][i]}`} />
              <Bar className={`h-3 max-w-full rounded-sm ${["w-72", "w-64", "w-80", "w-60"][i]}`} />
            </div>
            <Bar className="h-5 w-16 shrink-0 rounded-sm" />
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Pages that are a heading and a form: New source, Add a bill, Edit ... */
export function FormSkeleton() {
  return (
    <Frame>
      <Bar className="h-3.5 w-28 rounded-sm" />
      <div className="mt-4"><Bar className="h-9 w-56 max-w-full rounded-sm" /></div>
      <div className="mt-8 flex max-w-xl flex-col gap-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Bar className={`h-3.5 rounded-sm ${["w-24", "w-36", "w-28", "w-32"][i]}`} />
            <Bar className="h-10 w-full rounded-md" />
          </div>
        ))}
        <Bar className="h-10 w-32 rounded-md" />
      </div>
    </Frame>
  );
}
