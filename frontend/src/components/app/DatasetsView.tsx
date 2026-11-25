"use client";

import Link from "next/link";

import { DatasetRow } from "@/components/app/DatasetRow";
import { QueryError } from "@/components/app/QueryError";
import { Button, buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/useApiQuery";
import { formatNumber, pluralize } from "@/lib/format";
import type { Dataset } from "@/lib/types/api";

export function DatasetsView() {
  const { data, error, loading, reload } = useApiQuery<Dataset[]>("/datasets");
  const datasets = data ?? [];
  const totalRows = datasets.reduce(
    (total, dataset) => total + dataset.total_rows,
    0,
  );

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Biblioteca"
        title="Datasets"
        description="Las fuentes de datos que alimentan tus experimentos, en CSV o JSON."
        actions={
          <>
            <Link
              href="/datasets/new"
              className={buttonStyles({ variant: "primary", size: "sm" })}
            >
              <Icon name="plus" className="size-4" />
              Nuevo dataset
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={reload}
              icon={<Icon name="refresh" className="size-4" />}
            >
              Actualizar
            </Button>
          </>
        }
      />

      {error ? <QueryError error={error} onRetry={reload} /> : null}

      {loading ? (
        <div className="surface rounded-[3px] p-5 sm:p-6">
          <div className="space-y-5">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="flex items-center gap-3.5">
                <Skeleton className="size-10 shrink-0 rounded-[3px]" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
                <Skeleton className="h-6 w-14 rounded-[2px]" />
              </div>
            ))}
          </div>
        </div>
      ) : datasets.length === 0 ? (
        <EmptyState
          icon="database"
          title="Aún no hay datasets"
          description="Los datasets CSV y JSON que cargues aparecerán aquí con su tamaño, filas y columnas."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href="/datasets/new"
                className={buttonStyles({ size: "sm" })}
              >
                <Icon name="plus" className="size-4" />
                Crear primer dataset
              </Link>
              <Button variant="secondary" size="sm" onClick={reload}>
                Volver a comprobar
              </Button>
            </div>
          }
        />
      ) : (
        <section className="surface overflow-hidden rounded-[3px]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-950/15 px-5 py-4 sm:px-6">
            <p className="text-xs text-ink-600">
              {formatNumber(datasets.length)}{" "}
              {pluralize(datasets.length, "dataset", "datasets")} ·{" "}
              {formatNumber(totalRows)} filas
            </p>
            <span className="inline-flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ink-500">
              <span className="size-1.5 rounded-full bg-electric-400" />
              Sincronizado
            </span>
          </div>
          <div className="divide-y divide-ink-950/10 px-5 sm:px-6">
            {datasets.map((dataset) => (
              <DatasetRow key={dataset.id} dataset={dataset} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
