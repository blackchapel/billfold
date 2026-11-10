import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { CONNECTION_KIND_LABELS } from "@/constants/connections";
import type { ConnectionDto } from "@/types/connection";

/** Presentational: the page decides which buttons to show and passes them in. */
export function ConnectionList({ items, actions }: { items: ConnectionDto[]; actions: (c: ConnectionDto) => ReactNode }) {
  if (items.length === 0) return <p className="mt-3 text-sm text-muted">Nothing is linked yet.</p>;
  return (
    <ul className="mt-3 divide-y divide-line border-y border-line">
      {items.map((c) => (
        <li key={c.id} className="flex flex-col gap-2 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="font-medium">{c.label}</span>
              <span className="text-muted"> · {CONNECTION_KIND_LABELS[c.kind]}</span>
              {c.label !== c.accountEmail && <span className="block text-xs text-muted">{c.accountEmail}</span>}
            </span>
            <Badge tone={c.status === "active" ? "good" : "bad"}>{c.status === "active" ? "working" : "needs attention"}</Badge>
          </div>
          {c.lastError && <p className="text-xs text-danger">{c.lastError}</p>}
          <p className="text-xs text-muted">{c.lastCheckedAt ? `Last checked ${c.lastCheckedAt.toLocaleString("en-IN")}` : "Not checked yet"}</p>
          {actions(c)}
        </li>
      ))}
    </ul>
  );
}
