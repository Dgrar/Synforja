"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StateBadge } from "@/components/app/StateBadge";
import { QueryError } from "@/components/app/QueryError";
import { TopologyPreview } from "@/components/networks/TopologyPreview";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonStyles } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { deleteNetwork } from "@/lib/api/networks";
import { fetchWeightsDump } from "@/lib/api/training";
import { downloadBlob } from "@/lib/download";
import { formatNumber } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks/useApiQuery";
import type { Activation, Loss, Network } from "@/lib/types/api";

const ACTIVATION_LABELS: Record<Activation, string> = {
  relu: "ReLU",
  sigmoid: "Sigmoide",
  tanh: "Tanh",
  softmax: "Softmax",
  linear: "Lineal",
};

const LOSS_LABELS: Record<Loss, string> = {
  mse: "MSE",
  bce: "BCE",
  mae: "MAE",
};

function DetailLoading() {
  return (
    <div className="space-y-7">
      <div className="space-y-3 border-b border-ink-950/20 pb-7">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Skeleton className="h-96 rounded-[3px]" />
        <Skeleton className="h-80 rounded-[3px]" />
      </div>
    </div>
  );
}

export function NetworkDetail({ id }: { id: number }) {
  const router = useRouter();
  const { data: network, error, loading, reload } =
    useApiQuery<Network>(`/networks/${id}`);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloadingWeights, setDownloadingWeights] = useState(false);
  const [weightsError, setWeightsError] = useState<string | null>(null);

  async function handleDownloadWeights() {
    setDownloadingWeights(true);
    setWeightsError(null);
    try {
      const blob = await fetchWeightsDump(id);
      downloadBlob(`red-${id}.json`, blob);
    } catch (downloadError) {
      setWeightsError(errorMessage(downloadError));
    } finally {
      setDownloadingWeights(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setActionError(null);
    try {
      await deleteNetwork(id);
      setConfirmOpen(false);
      router.replace("/networks");
      router.refresh();
    } catch (deleteError) {
      setConfirmOpen(false);
      setActionError(errorMessage(deleteError));
      if (deleteError instanceof ApiError && deleteError.status === 404) {
        reload();
      }
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <DetailLoading />;
  }

  if (!network) {
    return (
      <div className="space-y-6">
        <QueryError error={error} onRetry={reload} />
        <Link
          href="/networks"
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          Volver a redes
        </Link>
      </div>
    );
  }

  const totalNeurons = network.layers.reduce(
    (total, layer) => total + layer.size,
    0,
  );
  const trainPercent = Math.round(network.training_split * 100);

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-5 border-b border-ink-950/20 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <p className="text-[0.68rem] font-medium uppercase tracking-[0.22em] text-vermilion-500">
              Red · detalle
            </p>
            <StateBadge state={network.state} />
          </div>
          <h1 className="font-serif text-3xl font-normal tracking-tight text-ink-950 sm:text-4xl">
            {network.name}
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            {network.type} · {formatNumber(network.layers.length)} capas ·{" "}
            {formatNumber(totalNeurons)} neuronas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/networks"
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            Volver
          </Link>
          <Link
            href={`/networks/${network.id}/edit`}
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            Editar
          </Link>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
          >
            Eliminar
          </Button>
        </div>
      </header>

      {actionError ? (
        <Alert tone="error" title="No se pudo eliminar la red">
          {actionError}
        </Alert>
      ) : null}

      {network.state === "training" ? (
        <Alert tone="warning" title="Entrenamiento en curso">
          Esta red está entrenando. Podrás editarla o eliminarla cuando termine.
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] xl:items-start">
        <div className="min-w-0 space-y-6">
          <section className="surface rounded-[3px] p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-lg font-normal text-ink-950">
                  Topología
                </h2>
                <p className="mt-1 text-xs leading-5 text-ink-600">
                  Arquitectura persistida de la red. La vista es solo esquemática.
                </p>
              </div>
              <span className="rounded-full border border-ink-950/20 px-2.5 py-1 font-mono text-[0.62rem] text-ink-500">
                {formatNumber(totalNeurons)} neuronas
              </span>
            </div>
            <TopologyPreview layers={network.layers} />

            <div className="mt-5 divide-y divide-ink-950/10">
              {network.layers.map((layer, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-7 items-center justify-center rounded-[3px] border border-ink-950/15 bg-paper-50 font-mono text-[0.64rem] text-electric-500">
                      {index + 1}
                    </span>
                    <span className="text-ink-800">
                      {formatNumber(layer.size)}{" "}
                      {layer.size === 1 ? "neurona" : "neuronas"}
                    </span>
                  </div>
                  <span className="rounded-full border border-ink-950/15 px-2.5 py-1 text-[0.68rem] text-ink-600">
                    {ACTIVATION_LABELS[layer.activation] ?? layer.activation}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="surface rounded-[3px] p-5 sm:p-6">
            <h2 className="font-serif text-lg font-normal text-ink-950">
              Configuración
            </h2>
            <dl className="mt-5 space-y-3.5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-600">Tipo</dt>
                <dd className="font-mono text-ink-900">{network.type}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-600">Épocas</dt>
                <dd className="font-mono text-ink-900">
                  {formatNumber(network.epochs)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-600">Learning rate</dt>
                <dd className="font-mono text-ink-900">
                  {network.learning_rate}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-600">Pérdida</dt>
                <dd className="font-mono text-ink-900">
                  {LOSS_LABELS[network.loss] ?? network.loss}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-600">Split</dt>
                <dd className="font-mono text-ink-900">
                  {trainPercent} % / {100 - trainPercent} %
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-ink-600">Semilla</dt>
                <dd className="break-all text-right font-mono text-[0.72rem] text-ink-900">
                  {String(network.seed)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-[3px] border border-electric-400/15 bg-electric-400/[0.045] p-5 sm:p-6">
            <h2 className="font-serif text-lg font-normal text-ink-950">
              Entrenamiento
            </h2>
            <p className="mt-2 text-xs leading-5 text-ink-600">
              Lanza una corrida contra uno de tus datasets, en vivo con curva
              época a época o en one-shot. La configuración guardada es la que
              se usa.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/networks/${network.id}/train`}
                className={buttonStyles({ variant: "primary", size: "sm" })}
              >
                Entrenar esta red
              </Link>
              <Link
                href={`/networks/${network.id}/runs`}
                className={buttonStyles({ variant: "secondary", size: "sm" })}
              >
                Ver corridas
              </Link>
              {network.state === "trained" ? (
                <>
                  <Link
                    href={`/networks/${network.id}/predict`}
                    className={buttonStyles({
                      variant: "secondary",
                      size: "sm",
                    })}
                  >
                    Predecir
                  </Link>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={downloadingWeights}
                    onClick={() => void handleDownloadWeights()}
                    icon={<Icon name="download" className="size-4" />}
                  >
                    Descargar pesos
                  </Button>
                </>
              ) : null}
            </div>
            {weightsError ? (
              <p
                role="alert"
                className="mt-3 text-xs leading-5 text-vermilion-500"
              >
                {weightsError}
              </p>
            ) : null}
            {network.state !== "trained" ? (
              <p className="mt-3 text-xs leading-5 text-ink-600">
                La predicción y la descarga de pesos aparecen cuando la red
                queda entrenada.
              </p>
            ) : null}
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Eliminar ${network.name}`}
        description="La red y su configuración se borrarán definitivamente. Los runs y pesos asociados dejarán de estar disponibles."
        confirmLabel="Eliminar red"
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
