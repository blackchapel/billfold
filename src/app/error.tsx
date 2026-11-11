"use client";
import { ErrorPanel } from "@/components/features/shell/error-panel";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto max-w-3xl px-6 py-10"><ErrorPanel reset={reset} digest={error.digest} /></div>;
}
