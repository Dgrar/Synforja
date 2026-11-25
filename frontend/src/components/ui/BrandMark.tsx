import { cn } from "@/lib/cn";

export function BrandMark({
  className,
  withWordmark = true,
}: {
  className?: string;
  withWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <svg
        viewBox="0 0 40 40"
        aria-hidden="true"
        className="size-9 shrink-0 text-electric-400"
      >
        <defs>
          <linearGradient id="brand-mark-gradient" x1="8" y1="6" x2="34" y2="34">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.95" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <rect
          x="1"
          y="1"
          width="38"
          height="38"
          rx="3"
          fill="currentColor"
          fillOpacity="0.06"
          stroke="currentColor"
          strokeOpacity="0.35"
        />
        <path
          d="M12 26.5 19.5 12 28 25.5 17 29"
          fill="none"
          stroke="url(#brand-mark-gradient)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="19.5" cy="12" r="2.3" fill="currentColor" />
        <circle cx="12" cy="26.5" r="2.3" fill="currentColor" fillOpacity="0.7" />
        <circle cx="28" cy="25.5" r="2.3" fill="var(--color-vermilion-300)" />
        <circle cx="17" cy="29" r="1.7" fill="currentColor" fillOpacity="0.45" />
      </svg>
      {withWordmark ? (
        <span className="flex flex-col leading-none">
          <span className="font-serif text-xl font-normal tracking-tight text-ink-950">
            Synforja
          </span>
          <span className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.22em] text-ink-500">
            Neural lab
          </span>
        </span>
      ) : null}
    </span>
  );
}
