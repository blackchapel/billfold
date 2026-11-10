"use client";

/**
 * Shows an email's HTML exactly as written. The frame is sandboxed with no permissions at all, so nothing in the message
 * can run a script, submit a form or reach this page, even though Billfold escapes every value that goes into it.
 */
export function MessageFrame({ html, title }: { html: string; title: string }) {
  return <iframe title={title} sandbox="" srcDoc={html} className="h-[28rem] w-full rounded-md border border-line bg-white" />;
}
