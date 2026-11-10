export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Billfold" className="text-accent">
      <rect width="32" height="32" rx="6" fill="currentColor" />
      <path d="M7 9h18v14H7z" fill="none" stroke="var(--paper)" strokeWidth="2" />
      <path d="M7 9l9 7 9-7" fill="none" stroke="var(--paper)" strokeWidth="2" />
    </svg>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className="font-serif text-xl tracking-tight">Billfold</span>
    </span>
  );
}
