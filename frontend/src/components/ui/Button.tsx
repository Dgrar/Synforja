import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/Spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-mint-400 text-ink-950 shadow-[0_10px_35px_-18px_var(--color-mint-400)] hover:bg-mint-300 disabled:bg-mint-400/40",
  secondary:
    "border border-white/15 bg-white/[0.04] text-mist-100 hover:border-mint-400/40 hover:bg-white/[0.08]",
  ghost: "text-mist-300 hover:bg-white/[0.06] hover:text-mist-50",
  danger:
    "border border-coral-400/30 bg-coral-400/10 text-coral-400 hover:bg-coral-400/15",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 rounded-lg px-3 text-xs",
  md: "h-11 rounded-xl px-4 text-sm",
  lg: "h-12 rounded-xl px-5 text-sm",
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
    "cursor:pointer inline-flex items-center justify-center gap-2 font-medium transition duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
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
