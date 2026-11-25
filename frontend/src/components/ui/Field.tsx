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
        className="block text-sm font-medium text-ink-900"
      >
        {label}
      </label>
      <input
        {...props}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-11 w-full rounded-[3px] border border-ink-950/20 bg-paper-50 px-3.5 text-sm text-ink-950 outline-none transition placeholder:text-ink-600/60 hover:border-ink-950/35 focus:border-electric-400 focus:bg-paper-50 focus:ring-2 focus:ring-electric-400/15 disabled:cursor-not-allowed disabled:opacity-60",
          error && "border-vermilion-500/50 focus:border-vermilion-500 focus:ring-vermilion-500/15",
          className,
        )}
      />
      {hint ? (
        <p id={hintId} className="text-xs leading-5 text-ink-600">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs leading-5 text-vermilion-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
