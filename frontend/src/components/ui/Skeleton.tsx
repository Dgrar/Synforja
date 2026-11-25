import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block animate-pulse rounded-[3px] bg-ink-950/[0.06]",
        className,
      )}
    />
  );
}
