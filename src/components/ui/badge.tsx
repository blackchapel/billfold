const tones = { neutral: "border-line text-muted", good: "border-accent text-accent", warn: "border-warn text-warn", bad: "border-danger text-danger" } as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={`inline-block rounded-sm border px-1.5 py-0.5 text-xs uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}
