import { cn } from "@/lib/cn";
import type { NetworkState } from "@/lib/types/api";

const stateStyles: Record<
  NetworkState,
  { label: string; className: string; dot: string }
> = {
  draft: {
    label: "Borrador",
    className: "border-ink-950/[0.12] bg-ink-950/[0.05] text-ink-600",
    dot: "bg-ink-600",
  },
  training: {
    label: "Entrenando",
    className: "border-ochre-400/25 bg-ochre-400/[0.08] text-ochre-500",
    dot: "animate-pulse bg-ochre-400",
  },
  trained: {
    label: "Entrenada",
    className: "border-electric-400/25 bg-electric-400/[0.08] text-electric-500",
    dot: "bg-electric-400",
  },
};

export function StateBadge({ state }: { state: NetworkState }) {
  const style = stateStyles[state] ?? stateStyles.draft;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.1em]",
        style.className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {style.label}
    </span>
  );
}
