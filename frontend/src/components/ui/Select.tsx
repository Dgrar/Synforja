import { useId, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
  id?: string;
}

export function Select({
  label,
  hint,
  error,
  id,
  className,
  children,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-mist-100"
      >
        {label}
      </label>
      <select
        {...props}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-11 w-full rounded-xl border border-white/12 bg-ink-950/60 px-3.5 text-sm text-mist-50 outline-none transition hover:border-white/20 focus:border-mint-400/70 focus:bg-ink-950 focus:ring-2 focus:ring-mint-400/15 disabled:cursor-not-allowed disabled:opacity-60",
          error &&
            "border-coral-400/60 focus:border-coral-400 focus:ring-coral-400/15",
          className,
        )}
      >
        {children}
      </select>
      {hint ? (
        <p id={hintId} className="text-xs leading-5 text-mist-400">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs leading-5 text-coral-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
