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
      className="group -mx-2 flex items-center gap-3.5 rounded-xl px-2 py-3.5 transition hover:bg-white/[0.035]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-mint-300">
        <Icon name="database" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-mist-50">
          {dataset.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-mist-500">
          {formatBytes(dataset.content_bytes)} ·{" "}
          {formatNumber(dataset.total_rows)}{" "}
          {pluralize(dataset.total_rows, "fila", "filas")} ·{" "}
          {dataset.input_cols} entradas · {dataset.output_cols} salidas
        </p>
      </div>
      <SourceBadge source={dataset.source_type} />
      <Icon
        name="chevron-right"
        className="size-4 shrink-0 text-mist-500 transition group-hover:translate-x-0.5 group-hover:text-mint-300"
      />
    </Link>
  );
}
