"use client";

import { useMemo } from "react";

import { Alert } from "@/components/ui/Alert";
import {
  parseCsvPreview,
  parseJsonPreview,
} from "@/lib/datasets/preview";
import { formatNumber } from "@/lib/format";
import type { Dataset } from "@/lib/types/api";

export function DatasetPreview({
  dataset,
  content,
}: {
  dataset: Dataset;
  content: string;
}) {
  const preview = useMemo(() => {
    try {
      if (dataset.source_type === "csv") {
        const result = parseCsvPreview(content);
        return { kind: "csv" as const, ...result, error: null };
      }
      return { kind: "json" as const, ...parseJsonPreview(content), error: null };
    } catch (previewError) {
      return {
        kind: dataset.source_type,
        rows: [],
        truncated: false,
        error:
          previewError instanceof Error
            ? previewError.message
            : "No se pudo interpretar el contenido.",
      };
    }
  }, [content, dataset.source_type]);

  if (preview.error) {
    return (
      <Alert tone="error" title="No se pudo mostrar la vista previa">
        {preview.error}
      </Alert>
    );
  }

  if (preview.kind === "csv") {
    const rows = preview.rows as string[][];
    const columns = rows.reduce((width, row) => Math.max(width, row.length), 0);

    return (
      <div className="space-y-3">
        <div className="overflow-hidden rounded-[3px] border border-ink-950/15">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <caption className="sr-only">
                Vista previa del dataset CSV
              </caption>
              <thead className="bg-paper-200 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ink-600">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    #
                  </th>
                  {Array.from({ length: columns }, (_, index) => (
                    <th
                      key={index}
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 font-mono font-medium"
                    >
                      col {index + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-950/10 text-ink-700">
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-ink-500">
                      {rowIndex + 1}
                    </td>
                    {Array.from({ length: columns }, (_, columnIndex) => (
                      <td
                        key={columnIndex}
                        className="whitespace-nowrap px-3 py-2 font-mono"
                      >
                        {row[columnIndex] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-ink-500">
          {preview.truncated
            ? `Vista previa de las primeras ${formatNumber(rows.length)} filas de ${formatNumber(dataset.total_rows)}. Descarga el dataset para ver el contenido completo.`
            : `Vista previa de ${formatNumber(rows.length)} filas.`}
        </p>
      </div>
    );
  }

  const rows = preview.rows as { inputs: number[]; expects: number[] }[];

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[3px] border border-ink-950/15">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <caption className="sr-only">
              Vista previa del dataset JSON
            </caption>
            <thead className="bg-paper-200 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-ink-600">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  #
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  inputs
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  expects
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-950/10 text-ink-700">
              {rows.map((row, index) => (
                <tr key={index}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-ink-500">
                    {index + 1}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono">
                    [{row.inputs.join(", ")}]
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono">
                    [{row.expects.join(", ")}]
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-ink-500">
        {preview.truncated
          ? `Vista previa de los primeros ${formatNumber(rows.length)} ejemplos de ${formatNumber(dataset.total_rows)}. Descarga el dataset para ver el contenido completo.`
          : `Vista previa de ${formatNumber(rows.length)} ejemplos.`}
      </p>
    </div>
  );
}
