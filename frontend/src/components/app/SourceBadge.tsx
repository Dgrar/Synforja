import type { Dataset } from "@/lib/types/api";

export function SourceBadge({ source }: { source: Dataset["source_type"] }) {
  return (
    <span className="inline-flex rounded-[2px] border border-ink-950/15 bg-paper-50 px-2 py-1 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ink-600">
      {source}
    </span>
  );
}
