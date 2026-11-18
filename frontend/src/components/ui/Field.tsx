import { useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string;
  id?: string;
}

export function Field({
  label,
  hint,
  error,
  id,
  className,
  ...props
}: FieldProps) {
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
      <input
        {...props}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-11 w-full rounded-xl border border-white/12 bg-ink-950/60 px-3.5 text-sm text-mist-50 outline-none transition placeholder:text-mist-400/60 hover:border-white/20 focus:border-mint-400/70 focus:bg-ink-950 focus:ring-2 focus:ring-mint-400/15 disabled:cursor-not-allowed disabled:opacity-60",
          error && "border-coral-400/60 focus:border-coral-400 focus:ring-coral-400/15",
          className,
        )}
      />
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
