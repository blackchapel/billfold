import type { InputHTMLAttributes, ReactNode } from "react";

export function Field({ label, hint, error, id, className = "", ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const inputId = id ?? rest.name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">{label}</label>
      <input id={inputId} {...rest} aria-invalid={!!error} aria-describedby={hint ? `${inputId}-hint` : undefined}
        className={`min-h-10 rounded-md border border-line bg-surface px-3 text-sm placeholder:text-muted ${className}`} />
      {hint && <p id={`${inputId}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function FormMessage({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-md border border-danger px-3 py-2 text-sm text-danger">{children}</p>;
}
