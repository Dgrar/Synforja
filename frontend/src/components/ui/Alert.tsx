import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type AlertTone = "error" | "info" | "success" | "warning";

const tones: Record<AlertTone, string> = {
  error: "border-vermilion-400/30 bg-vermilion-400/[0.06] text-vermilion-500",
  info: "border-electric-400/25 bg-electric-400/[0.05] text-ink-900",
  success: "border-electric-400/30 bg-electric-400/[0.06] text-electric-500",
  warning: "border-ochre-400/30 bg-ochre-400/[0.07] text-ochre-500",
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
        "rounded-[3px] border px-4 py-3 text-sm leading-6",
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
