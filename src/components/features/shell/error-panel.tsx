"use client";
import { Button } from "@/components/ui/button";

/** What people see when a page fails to load. A retry button beats a dead click and a manual reload. */
export function ErrorPanel({ reset, digest }: { reset: () => void; digest?: string }) {
  return (
    <div role="alert" className="max-w-xl rounded-md border border-danger p-6">
      <h1 className="font-serif text-2xl">This page did not load</h1>
      <p className="mt-2 text-sm text-muted">It is usually a brief hiccup. Try again; if it keeps happening, tell the person who runs Billfold{digest ? ` and mention code ${digest}` : ""}.</p>
      <div className="mt-4"><Button type="button" onClick={reset}>Try again</Button></div>
    </div>
  );
}
