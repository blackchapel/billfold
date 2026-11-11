"use client";
import Link, { useLinkStatus } from "next/link";
import { useEffect, useState } from "react";

/**
 * What a link shows while the page it points to is being prepared: a small spinner at once, and after a few seconds an honest
 * "still loading" note, so a slow server never looks like a click that did nothing. It must sit inside a <Link>.
 */
function PendingMark() {
  const { pending } = useLinkStatus();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setSlow(true), 6000);
    return () => { clearTimeout(t); setSlow(false); };
  }, [pending]);
  if (!pending) return null;
  return (
    <span role="status" className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="spinner" />
      <span className={slow ? "text-xs text-muted" : "sr-only"}>{slow ? "Still loading… reload the page if nothing happens." : "Opening…"}</span>
    </span>
  );
}

const BUTTON = {
  primary: "inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90",
  secondary: "inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 text-sm font-medium hover:bg-paper",
} as const;

/** A link that looks like a button (New source, Add a bill ...) and shows that it was pressed. */
export function LinkButton({ href, variant = "primary", className = "", children }: { href: string; variant?: keyof typeof BUTTON; className?: string; children: React.ReactNode }) {
  return <Link href={href} className={`${BUTTON[variant]} ${className}`}>{children}<PendingMark /></Link>;
}

/** An underlined link inside text or a row of actions (Edit, All sources ...) that shows that it was pressed. */
export function TextLink({ href, className = "", children }: { href: string; className?: string; children: React.ReactNode }) {
  return <Link href={href} className={`inline-flex items-center gap-1.5 underline underline-offset-4 ${className}`}>{children}<PendingMark /></Link>;
}
