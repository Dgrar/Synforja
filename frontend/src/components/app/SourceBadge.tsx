import type { Dataset } from "@/lib/types/api";

export function SourceBadge({ source }: { source: Dataset["source_type"] }) {
  return (
    <span className="inline-flex rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-1 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-mist-400">
      {source}
    </span>
  );
}
