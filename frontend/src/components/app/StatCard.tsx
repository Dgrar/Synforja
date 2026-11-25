import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  hint: string;
  icon: IconName;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden p-5 sm:p-6",
        accent ? "bg-electric-400/[0.05]" : "bg-transparent",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-ink-500">
          {label}
        </p>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center border",
            accent
              ? "border-vermilion-400/25 text-vermilion-400"
              : "border-ink-950/15 text-ink-500",
          )}
        >
          <Icon name={icon} className="size-4" />
        </span>
      </div>
      <p className="mt-4 font-serif text-4xl font-normal tracking-tight text-ink-950">
        {value}
      </p>
      <p className="mt-1 text-xs text-ink-500">{hint}</p>
    </div>
  );
}
