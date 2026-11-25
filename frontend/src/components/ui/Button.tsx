import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/Spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-electric-400 text-paper-50 hover:bg-electric-500 disabled:bg-electric-400/40",
  secondary:
    "border border-ink-950/20 bg-paper-50 text-ink-900 hover:border-electric-400/50 hover:bg-electric-400/[0.05]",
  ghost: "text-ink-700 hover:bg-ink-950/[0.06] hover:text-ink-950",
  danger:
    "border border-vermilion-400/30 bg-vermilion-400/[0.06] text-vermilion-500 hover:bg-vermilion-400/10",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 rounded-[3px] px-3 text-xs",
  md: "h-11 rounded-[3px] px-4 text-sm",
  lg: "h-12 rounded-[3px] px-5 text-sm",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(
    "cursor-pointer inline-flex items-center justify-center gap-2 font-medium transition duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    sizes[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, className })}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}
