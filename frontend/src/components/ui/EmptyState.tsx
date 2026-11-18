import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon = "spark",
  title,
  description,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-14 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-2xl border border-mint-400/20 bg-mint-400/[0.07] text-mint-300">
        <Icon name={icon} className="size-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-mist-50">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-mist-400">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
