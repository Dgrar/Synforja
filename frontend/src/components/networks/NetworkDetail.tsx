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
import { Skeleton } from "@/components/ui/Skeleton";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { deleteNetwork } from "@/lib/api/networks";
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
      <div className="space-y-3 border-b border-white/8 pb-7">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
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
      <header className="flex flex-col gap-5 border-b border-white/8 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <p className="text-[0.68rem] font-medium uppercase tracking-[0.22em] text-mint-400/80">
              Red · detalle
            </p>
            <StateBadge state={network.state} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-mist-50 sm:text-3xl">
            {network.name}
          </h1>
          <p className="mt-2 text-sm text-mist-400">
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
        <div className="space-y-6">
          <section className="surface rounded-2xl p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-mist-50">
                  Topología
                </h2>
                <p className="mt-1 text-xs leading-5 text-mist-400">
                  Arquitectura persistida de la red. La vista es solo esquemática.
                </p>
              </div>
              <span className="rounded-full border border-white/[0.1] px-2.5 py-1 font-mono text-[0.62rem] text-mist-500">
                {formatNumber(totalNeurons)} neuronas
              </span>
            </div>
            <TopologyPreview layers={network.layers} />

            <div className="mt-5 divide-y divide-white/[0.06]">
              {network.layers.map((layer, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] font-mono text-[0.64rem] text-mint-300">
                      {index + 1}
                    </span>
                    <span className="text-mist-200">
                      {formatNumber(layer.size)}{" "}
                      {layer.size === 1 ? "neurona" : "neuronas"}
                    </span>
                  </div>
                  <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[0.68rem] text-mist-400">
                    {ACTIVATION_LABELS[layer.activation] ?? layer.activation}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="surface rounded-2xl p-5 sm:p-6">
            <h2 className="text-base font-semibold text-mist-50">
              Configuración
            </h2>
            <dl className="mt-5 space-y-3.5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">Tipo</dt>
                <dd className="font-mono text-mist-100">{network.type}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">Épocas</dt>
                <dd className="font-mono text-mist-100">
                  {formatNumber(network.epochs)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">Learning rate</dt>
                <dd className="font-mono text-mist-100">
                  {network.learning_rate}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">Pérdida</dt>
                <dd className="font-mono text-mist-100">
                  {LOSS_LABELS[network.loss] ?? network.loss}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">Split</dt>
                <dd className="font-mono text-mist-100">
                  {trainPercent} % / {100 - trainPercent} %
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-mist-400">Semilla</dt>
                <dd className="break-all text-right font-mono text-[0.72rem] text-mist-100">
                  {String(network.seed)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-mint-400/15 bg-mint-400/[0.045] p-5 sm:p-6">
            <h2 className="text-base font-semibold text-mist-50">
              Siguiente paso
            </h2>
            <p className="mt-2 text-xs leading-5 text-mist-400">
              El entrenamiento y la inferencia llegan en el siguiente bloque.
              Esta red ya puede editarse y persistirse en la API.
            </p>
            <Link
              href={`/networks/${network.id}/edit`}
              className={buttonStyles({
                variant: "secondary",
                size: "sm",
                className: "mt-4",
              })}
            >
              Revisar configuración
            </Link>
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
