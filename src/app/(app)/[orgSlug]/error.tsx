"use client";
import { ErrorPanel } from "@/components/features/shell/error-panel";

export default function OrgError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel reset={reset} digest={error.digest} />;
}
