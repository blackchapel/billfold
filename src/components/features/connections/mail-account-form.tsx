"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionState } from "@/types/action";

type A = (p: ActionState | null, f: FormData) => Promise<ActionState>;

/** Common providers so people do not have to look up server names. Ports 993 and 465 use SSL straight away. */
const PRESETS = {
  gmail: { label: "Gmail", imap: ["imap.gmail.com", 993, true], smtp: ["smtp.gmail.com", 465, true] },
  outlook: { label: "Outlook / Microsoft 365", imap: ["outlook.office365.com", 993, true], smtp: ["smtp.office365.com", 587, false] },
  yahoo: { label: "Yahoo", imap: ["imap.mail.yahoo.com", 993, true], smtp: ["smtp.mail.yahoo.com", 465, true] },
} as const;

export function MailAccountForm({ action }: { action: A }) {
  const { formAction, pending, error, state } = useActionForm<void>(action as never);
  const [kind, setKind] = useState<"imap" | "smtp">("imap");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("993");
  const [secure, setSecure] = useState(true);

  const preset = (key: keyof typeof PRESETS) => {
    const [h, p, s] = PRESETS[key][kind];
    setHost(h); setPort(String(p)); setSecure(s);
  };
  const switchKind = (k: "imap" | "smtp") => {
    setKind(k);
    setPort(k === "imap" ? "993" : "465");
    setSecure(true);
  };

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">What is this account for?</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="kind" value="imap" checked={kind === "imap"} onChange={() => switchKind("imap")} /> Receiving bills (IMAP)</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="kind" value="smtp" checked={kind === "smtp"} onChange={() => switchKind("smtp")} /> Sending summaries (SMTP)</label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Fill in for:</span>
        {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
          <button key={k} type="button" onClick={() => preset(k)} className="rounded-md border border-line px-2 py-1 hover:bg-surface">{PRESETS[k].label}</button>
        ))}
      </div>
      <Field name="label" label="Name (optional)" placeholder="Family bills inbox" maxLength={60} />
      <Field name="host" label="Server" value={host} onChange={(e) => setHost(e.target.value)} placeholder="imap.example.com" required autoCapitalize="none" autoCorrect="off" />
      <div className="flex items-end gap-4">
        <Field name="port" label="Port" type="number" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} required min={1} max={65535} className="w-28" />
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="secure" checked={secure} onChange={(e) => setSecure(e.target.checked)} /> Use SSL/TLS directly</label>
      </div>
      <Field name="username" label="Email address (username)" type="email" required autoComplete="off" autoCapitalize="none" />
      <Field name="password" label="App password" type="password" required autoComplete="new-password"
        hint="Use an app password, not your normal password. Billfold tests the login before saving it and keeps it encrypted." />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Testing login…" : "Test and save"}</Button>
        {state?.ok && <span role="status" className="text-sm text-muted">Saved.</span>}
      </div>
      {error && <FormMessage>{error}</FormMessage>}
    </form>
  );
}
