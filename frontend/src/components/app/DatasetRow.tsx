import Link from "next/link";

import { SourceBadge } from "@/components/app/SourceBadge";
import { Icon } from "@/components/ui/Icon";
import { formatBytes, formatNumber, pluralize } from "@/lib/format";
import type { Dataset } from "@/lib/types/api";

export function DatasetRow({ dataset }: { dataset: Dataset }) {
  return (
    <Link
      href={`/datasets/${dataset.id}`}
      aria-label={`Abrir ${dataset.name}`}
      className="group -mx-2 flex items-center gap-3.5 rounded-[3px] px-2 py-3.5 transition hover:bg-ink-950/[0.04]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[3px] border border-ink-950/15 bg-paper-50 text-electric-500">
        <Icon name="database" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-950">
          {dataset.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-500">
          {formatBytes(dataset.content_bytes)} ·{" "}
          {formatNumber(dataset.total_rows)}{" "}
          {pluralize(dataset.total_rows, "fila", "filas")} ·{" "}
          {dataset.input_cols} entradas · {dataset.output_cols} salidas
        </p>
      </div>
      <SourceBadge source={dataset.source_type} />
      <Icon
        name="chevron-right"
        className="size-4 shrink-0 text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-electric-400"
      />
    </Link>
  );
}
