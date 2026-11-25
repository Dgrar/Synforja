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
        "flex flex-col items-center justify-center rounded-[3px] border border-dashed border-ink-950/20 bg-paper-50 px-6 py-14 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-[3px] border border-electric-400/25 bg-electric-400/[0.06] text-electric-500">
        <Icon name={icon} className="size-5" />
      </span>
      <h3 className="mt-4 font-serif text-lg font-normal text-ink-950">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-600">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
