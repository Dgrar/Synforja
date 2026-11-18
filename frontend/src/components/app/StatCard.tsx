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
        "group relative overflow-hidden rounded-2xl border p-5 transition duration-300",
        accent
          ? "border-mint-400/20 bg-mint-400/[0.06] hover:border-mint-400/35"
          : "border-white/[0.08] bg-white/[0.025] hover:border-white/[0.14] hover:bg-white/[0.04]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-mist-400">
          {label}
        </p>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl border",
            accent
              ? "border-mint-400/20 bg-mint-400/[0.1] text-mint-300"
              : "border-white/[0.08] bg-white/[0.03] text-mist-300",
          )}
        >
          <Icon name={icon} className="size-4" />
        </span>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-mist-50">
        {value}
      </p>
      <p className="mt-1 text-xs text-mist-500">{hint}</p>
    </div>
  );
}
