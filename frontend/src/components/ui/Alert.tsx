import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type AlertTone = "error" | "info" | "success" | "warning";

const tones: Record<AlertTone, string> = {
  error: "border-coral-400/30 bg-coral-400/[0.08] text-coral-400",
  info: "border-mint-400/25 bg-mint-400/[0.06] text-mist-100",
  success: "border-mint-400/30 bg-mint-400/[0.08] text-mint-300",
  warning: "border-amber-400/30 bg-amber-400/[0.08] text-amber-400",
};

export function Alert({
  tone = "info",
  title,
  children,
  actions,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm leading-6",
        tones[tone],
        className,
      )}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      <div className={cn(title && "mt-1 opacity-90")}>{children}</div>
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
