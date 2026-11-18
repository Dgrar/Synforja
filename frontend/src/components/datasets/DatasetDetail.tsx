"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { QueryError } from "@/components/app/QueryError";
import { SourceBadge } from "@/components/app/SourceBadge";
import { DatasetPreview } from "@/components/datasets/DatasetPreview";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonStyles } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { deleteDataset } from "@/lib/api/datasets";
import { downloadTextFile } from "@/lib/download";
import { formatBytes, formatNumber, pluralize } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks/useApiQuery";
import type { Dataset, DatasetContent } from "@/lib/types/api";

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "dataset";
}

function DetailLoading() {
  return (
    <div className="space-y-7">
      <div className="space-y-3 border-b border-white/8 pb-7">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>
      <Skeleton className="h-[30rem] rounded-2xl" />
    </div>
  );
}

export function DatasetDetail({ id }: { id: number }) {
  const router = useRouter();
  const datasetQuery = useApiQuery<Dataset>(`/datasets/${id}`);
  const contentQuery = useApiQuery<DatasetContent>(`/datasets/${id}/content`);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const dataset = datasetQuery.data;
  const content = contentQuery.data;
  const contentBytes = useMemo(
    () => (content ? new Blob([content.content]).size : 0),
    [content],
  );

  async function handleDelete() {
    setDeleting(true);
    setActionError(null);
    try {
      await deleteDataset(id);
      setConfirmOpen(false);
      router.replace("/datasets");
      router.refresh();
    } catch (deleteError) {
      setConfirmOpen(false);
      setActionError(errorMessage(deleteError));
      if (deleteError instanceof ApiError && deleteError.status === 404) {
        datasetQuery.reload();
      }
    } finally {
      setDeleting(false);
    }
  }

  function handleDownload() {
    if (!dataset || !content) {
      return;
    }
    const extension = dataset.source_type === "csv" ? "csv" : "json";
    const type =
      dataset.source_type === "csv"
        ? "text/csv;charset=utf-8"
        : "application/json;charset=utf-8";
    downloadTextFile(
      `${safeFilename(dataset.name)}.${extension}`,
      content.content,
      type,
    );
  }

  if (datasetQuery.loading || contentQuery.loading) {
    return <DetailLoading />;
  }

  if (!dataset) {
    return (
      <div className="space-y-6">
        <QueryError error={datasetQuery.error} onRetry={datasetQuery.reload} />
        <Link
          href="/datasets"
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          Volver a datasets
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Datasets · detalle"
        title={dataset.name}
        description={`${formatNumber(dataset.total_rows)} ${pluralize(
          dataset.total_rows,
          "fila",
          "filas",
        )} · formato ${dataset.source_type.toUpperCase()}`}
        actions={
          <>
            <Link
              href="/datasets"
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              Volver
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownload}
              disabled={!content}
              icon={<Icon name="download" className="size-4" />}
            >
              Descargar
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={deleting}
              icon={<Icon name="trash" className="size-4" />}
            >
              Eliminar
            </Button>
          </>
        }
      />

      {actionError ? (
        <Alert tone="error" title="No se pudo eliminar el dataset">
          {actionError}
        </Alert>
      ) : null}

      {contentQuery.error ? (
        <Alert
          tone="error"
          title="No se pudo cargar el contenido"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={contentQuery.reload}
            >
              Reintentar
            </Button>
          }
        >
          {errorMessage(contentQuery.error)}
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)] xl:items-start">
        <section className="surface rounded-2xl p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-mist-50">
                Vista previa
              </h2>
              <p className="mt-1 text-xs leading-5 text-mist-400">
                {dataset.source_type === "csv"
                  ? "Primeras 200 filas del CSV, sin cabecera."
                  : "Primeros 100 ejemplos del JSON."}
              </p>
            </div>
            <SourceBadge source={dataset.source_type} />
          </div>

          {content && !contentQuery.error ? (
            <DatasetPreview dataset={dataset} content={content.content} />
          ) : contentQuery.error ? (
            <p className="rounded-xl border border-dashed border-white/12 px-4 py-10 text-center text-sm text-mist-500">
              La vista previa no está disponible hasta que el contenido cargue
              correctamente.
            </p>
          ) : null}
        </section>

        <aside className="space-y-6">
          <section className="surface rounded-2xl p-5 sm:p-6">
            <h2 className="text-base font-semibold text-mist-50">
              Metadatos
            </h2>
            <dl className="mt-5 space-y-3.5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">Formato</dt>
                <dd>
                  <SourceBadge source={dataset.source_type} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">Filas</dt>
                <dd className="font-mono text-mist-100">
                  {formatNumber(dataset.total_rows)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">Entradas</dt>
                <dd className="font-mono text-mist-100">
                  {formatNumber(dataset.input_cols)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">Salidas</dt>
                <dd className="font-mono text-mist-100">
                  {formatNumber(dataset.output_cols)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">Tamaño</dt>
                <dd className="font-mono text-mist-100">
                  {content ? formatBytes(contentBytes) : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">ID</dt>
                <dd className="font-mono text-mist-100">{dataset.id}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-mint-400/15 bg-mint-400/[0.045] p-5 sm:p-6">
            <h2 className="text-base font-semibold text-mist-50">
              Contenido completo
            </h2>
            <p className="mt-2 text-xs leading-5 text-mist-400">
              La descarga entrega el contenido íntegro guardado por la API, no
              la vista previa limitada.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownload}
              disabled={!content}
              className="mt-4"
              icon={<Icon name="download" className="size-4" />}
            >
              Descargar {dataset.source_type.toUpperCase()}
            </Button>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Eliminar ${dataset.name}`}
        description="El dataset se borrará definitivamente. La confirmación es obligatoria y no se puede deshacer."
        confirmLabel="Eliminar dataset"
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
