/**
 * What a page looks like while the server prepares it, shown the moment a link is pressed. The grey blocks are still; a single
 * band sweeps across the whole frame (see `.shimmer` in globals.css), so the animation costs one moving layer however many blocks there are.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="shimmer max-w-3xl">
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

const Block = ({ className }: { className: string }) => <div aria-hidden="true" className={`skeleton-block ${className}`} />;

function Heading() {
  return (
    <>
      <Block className="h-9 w-56 max-w-full" />
      <Block className="mt-4 h-4 w-80 max-w-full" />
    </>
  );
}

/** Pages that are a heading and a list: Sources, Runs, Bills, Members ... */
export function ListSkeleton() {
  return (
    <Frame>
      <Heading />
      <Block className="mt-6 h-10 w-36" />
      <div className="mt-8 divide-y divide-line border-y border-line">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2 py-4">
            <Block className="h-4 w-48 max-w-full" />
            <Block className="h-3 w-72 max-w-full" />
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
      <Block className="h-4 w-28" />
      <Block className="mt-4 h-9 w-56 max-w-full" />
      <div className="mt-8 flex max-w-xl flex-col gap-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Block className="h-4 w-32" />
            <Block className="h-10 w-full" />
          </div>
        ))}
        <Block className="h-10 w-32" />
      </div>
    </Frame>
  );
}
