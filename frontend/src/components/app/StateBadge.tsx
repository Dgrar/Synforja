import { cn } from "@/lib/cn";
import type { NetworkState } from "@/lib/types/api";

const stateStyles: Record<
  NetworkState,
  { label: string; className: string; dot: string }
> = {
  draft: {
    label: "Borrador",
    className: "border-white/[0.12] bg-white/[0.05] text-mist-300",
    dot: "bg-mist-400",
  },
  training: {
    label: "Entrenando",
    className: "border-amber-400/25 bg-amber-400/[0.08] text-amber-400",
    dot: "animate-pulse bg-amber-400",
  },
  trained: {
    label: "Entrenada",
    className: "border-mint-400/25 bg-mint-400/[0.08] text-mint-300",
    dot: "bg-mint-400",
  },
};

export function StateBadge({ state }: { state: NetworkState }) {
  const style = stateStyles[state] ?? stateStyles.draft;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-medium",
        style.className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {style.label}
    </span>
  );
}
