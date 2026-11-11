"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { periodLabel } from "@/constants/runs";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";
import type { StartRunOptions } from "@/types/run";

type A = (p: ActionState | null, f: FormData) => Promise<ActionState>;

export function StartRunForm({ action, options }: { action: A; options: StartRunOptions }) {
  const { formProps, pending, error } = useActionForm<void>(action as never);
  const [configId, setConfigId] = useState(options.configs[0]?.id ?? "");
  const [period, setPeriod] = useState(options.configs[0]?.defaultPeriod ?? options.periods[0] ?? "");
  const choose = (id: string) => {
    setConfigId(id);
    const config = options.configs.find((c) => c.id === id);
    if (config) setPeriod(config.defaultPeriod); // each configuration has its own usual month
  };
  return (
    <form {...formProps} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="runConfigId" className="text-sm font-medium">Run configuration</label>
        <select id="runConfigId" name="runConfigId" required value={configId} onChange={(e) => choose(e.target.value)} className="min-h-10 rounded-md border border-line bg-surface px-3 text-sm">
          {options.configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="periodKey" className="text-sm font-medium">Month to collect</label>
        <select id="periodKey" name="periodKey" required value={period} onChange={(e) => setPeriod(e.target.value)} className="min-h-10 rounded-md border border-line bg-surface px-3 text-sm">
          {options.periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
        </select>
        <p className="text-xs text-muted">Emails received in that month (India time) are collected. Bills already filed in an earlier run are skipped, so running a month twice is safe.</p>
      </div>
      <div><Button type="submit" disabled={pending}>{pending ? "Looking in the mailboxes…" : "Start run"}</Button></div>
      {error && <FormMessage>{error}</FormMessage>}
    </form>
  );
}
