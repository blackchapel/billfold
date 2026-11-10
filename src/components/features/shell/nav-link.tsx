"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

/** Shows that a tab switch is in flight, so a slow server never looks like a click that did nothing. */
function Pending() {
  const { pending } = useLinkStatus();
  // Space is kept either way so the tabs do not shift sideways when one is pressed. The ring turns with `transform` only.
  return <span aria-hidden="true" className={`ml-1.5 inline-block size-[0.8em] text-accent ${pending ? "spinner" : ""}`} />;
}

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`inline-flex items-center rounded-md px-3 py-2 text-sm whitespace-nowrap hover:bg-surface ${active ? "bg-surface font-medium" : ""}`}>
      {label}<Pending />
    </Link>
  );
}
