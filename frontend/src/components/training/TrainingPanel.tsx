"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { StateBadge } from "@/components/app/StateBadge";
import { QueryError } from "@/components/app/QueryError";
import { useNavigationGuard } from "@/components/session/NavigationGuard";
import { LossChart } from "@/components/training/LossChart";
import { TrainingResult } from "@/components/training/TrainingResult";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { readSseEvents } from "@/lib/api/sse";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { openTrainStream, trainOnce } from "@/lib/api/training";
import { formatNumber } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks/useApiQuery";
import type {
  Dataset,
  Network,
  Run,
  TrainEpochInfo,
  TrainErrorInfo,
  TrainStartInfo,
} from "@/lib/types/api";

type TrainingStatus =
  | "idle"
  | "starting"
  | "live"
  | "finished"
  | "cancelled"
  | "interrupted"
  | "error";

type TrainingMode = "live" | "oneshot";

const FLUSH_INTERVAL_MS = 100;

const GUARD_MESSAGE =
  "Si sales ahora, la corrida en vivo se cancelará sin run. ¿Quieres continuar?";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes} min ${String(seconds).padStart(2, "0")} s`;
}

function formatLossValue(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  if (value === 0) {
    return "0";
  }
  if (Math.abs(value) < 0.001 || Math.abs(value) >= 10000) {
    return value.toExponential(2);
  }
  return String(Number(value.toPrecision(4)));
}

function ProgressStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="py-3 sm:px-4 sm:first:pl-0">
      <dt className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-ink-500">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-sm text-ink-950">{value}</dd>
    </div>
  );
}

export function TrainingPanel({ id }: { id: number }) {
  const {
    data: network,
    error: networkError,
    loading: networkLoading,
    reload: reloadNetwork,
  } = useApiQuery<Network>(`/networks/${id}`);
  const {
    data: datasets,
    error: datasetsError,
    loading: datasetsLoading,
    reload: reloadDatasets,
  } = useApiQuery<Dataset[]>("/datasets");

  const [status, setStatus] = useState<TrainingStatus>("idle");
  const [mode, setMode] = useState<TrainingMode>("live");
  const [datasetId, setDatasetId] = useState("");
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [startInfo, setStartInfo] = useState<TrainStartInfo | null>(null);
  const [series, setSeries] = useState<{ train: number[]; test: number[] }>({
    train: [],
    test: [],
  });
  const [currentEpoch, setCurrentEpoch] = useState(0);
  const [streamError, setStreamError] = useState<TrainErrorInfo | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const controllerRef = useRef<AbortController | null>(null);
  const userCancelledRef = useRef(false);
  const mountedRef = useRef(true);
  const seriesRef = useRef<{ train: number[]; test: number[] }>({
    train: [],
    test: [],
  });
  const flushTimerRef = useRef<number | null>(null);
  const lastFlushRef = useRef(0);
  const startedAtRef = useRef(0);

  const { setActive } = useNavigationGuard();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, []);

  const guardActive =
    status === "live" || (status === "starting" && mode === "live");

  useEffect(() => {
    setActive(guardActive, GUARD_MESSAGE);
  }, [guardActive, setActive]);

  useEffect(() => {
    if (status !== "starting" && status !== "live") {
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 400);
    return () => window.clearInterval(timer);
  }, [status]);

  function flushProgress() {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    lastFlushRef.current = performance.now();
    if (!mountedRef.current) {
      return;
    }
    setSeries({
      train: [...seriesRef.current.train],
      test: [...seriesRef.current.test],
    });
    setCurrentEpoch(seriesRef.current.train.length);
  }

  function queueEpoch(info: TrainEpochInfo) {
    seriesRef.current.train.push(info.loss_train);
    seriesRef.current.test.push(info.loss_test);
    if (flushTimerRef.current !== null) {
      return;
    }
    const wait = Math.max(
      0,
      FLUSH_INTERVAL_MS - (performance.now() - lastFlushRef.current),
    );
    flushTimerRef.current = window.setTimeout(flushProgress, wait);
  }

  function resetProgress() {
    seriesRef.current = { train: [], test: [] };
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    setStartInfo(null);
    setSeries({ train: [], test: [] });
    setCurrentEpoch(0);
    setStreamError(null);
    setRun(null);
    setElapsedMs(0);
    setLaunchError(null);
  }

  async function launch() {
    if (status === "starting" || status === "live" || !datasetId || !network) {
      return;
    }

    resetProgress();
    const controller = new AbortController();
    controllerRef.current = controller;
    userCancelledRef.current = false;
    startedAtRef.current = Date.now();
    setStatus("starting");
    reloadNetwork();

    try {
      if (mode === "oneshot") {
        const result = await trainOnce(id, Number(datasetId));
        if (!mountedRef.current) {
          return;
        }
        setRun(result);
        setStatus("finished");
        reloadNetwork();
        return;
      }

      const stream = await openTrainStream(
        id,
        Number(datasetId),
        controller.signal,
      );
      if (!mountedRef.current) {
        return;
      }
      setStatus("live");

      let terminal = false;
      for await (const message of readSseEvents(stream)) {
        if (message.event === "start") {
          setStartInfo(message.data as TrainStartInfo);
          continue;
        }
        if (message.event === "epoch") {
          queueEpoch(message.data as TrainEpochInfo);
          continue;
        }
        if (message.event === "final") {
          flushProgress();
          setRun(message.data as Run);
          setStatus("finished");
          terminal = true;
          break;
        }
        if (message.event === "error") {
          flushProgress();
          setStreamError(message.data as TrainErrorInfo);
          setStatus("error");
          terminal = true;
          break;
        }
      }

      if (!terminal && mountedRef.current) {
        setStatus("interrupted");
        reloadNetwork();
      } else if (terminal && mountedRef.current) {
        reloadNetwork();
      }
    } catch (requestError) {
      if (!mountedRef.current) {
        return;
      }
      if (isAbortError(requestError)) {
        if (userCancelledRef.current) {
          flushProgress();
          setStatus("cancelled");
          reloadNetwork();
        }
        return;
      }
      if (requestError instanceof ApiError) {
        setLaunchError(errorMessage(requestError));
        setStatus("idle");
        reloadNetwork();
        return;
      }
      flushProgress();
      setStatus("interrupted");
      reloadNetwork();
    } finally {
      controllerRef.current = null;
    }
  }

  function handleCancel() {
    userCancelledRef.current = true;
    controllerRef.current?.abort();
  }

  function handleBackToIdle() {
    resetProgress();
    setStatus("idle");
  }

  if (networkLoading && !network) {
    return (
      <div className="space-y-7">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-9 w-80 max-w-full" />
        <Skeleton className="h-64 rounded-[3px]" />
      </div>
    );
  }

  if (!network) {
    return (
      <div className="space-y-6">
        <QueryError error={networkError} onRetry={reloadNetwork} />
        <Link
          href="/networks"
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          Volver a redes
        </Link>
      </div>
    );
  }

  const totalEpochs = startInfo?.epochs ?? network.epochs;
  const lastTrain = series.train[series.train.length - 1];
  const lastTest = series.test[series.test.length - 1];
  const progressPercent =
    totalEpochs > 0
      ? Math.min(100, Math.round((currentEpoch / totalEpochs) * 100))
      : 0;
  const epochRate =
    currentEpoch > 0 && elapsedMs > 0 ? elapsedMs / currentEpoch : 0;
  const remainingMs =
    epochRate > 0 ? epochRate * Math.max(0, totalEpochs - currentEpoch) : 0;
  const busy = status === "starting" || status === "live";

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Red · entrenamiento"
        title={`Entrenar ${network.name}`}
        description="Elige un dataset y la modalidad. La configuración de la red es la guardada; la interfaz no altera nada al lanzar."
        actions={<StateBadge state={network.state} />}
      />

      {launchError ? (
        <Alert tone="error" title="No se pudo lanzar el entrenamiento">
          {launchError}
        </Alert>
      ) : null}

      {network.state === "training" && !busy ? (
        <Alert tone="warning" title="Entrenamiento en curso">
          Esta red ya está entrenando (quizá desde otra pestaña). Cuando
          termine, el estado se actualizará y podrás lanzar otra corrida.
        </Alert>
      ) : null}

      {status === "idle" ? (
        <section className="surface rounded-[3px] p-5 sm:p-6">
          <h2 className="font-serif text-lg font-normal text-ink-950">
            Nueva corrida
          </h2>

          {datasetsLoading && !datasets ? (
            <div className="mt-5 space-y-3">
              <Skeleton className="h-11 w-full max-w-md" />
              <Skeleton className="h-11 w-full max-w-md" />
            </div>
          ) : datasetsError ? (
            <div className="mt-5">
              <QueryError error={datasetsError} onRetry={reloadDatasets} />
            </div>
          ) : !datasets || datasets.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="Necesitas un dataset"
                description="Entrena contra un dataset propio en CSV o JSON. Crea uno primero para poder lanzar la corrida."
                action={
                  <Link
                    href="/datasets/new"
                    className={buttonStyles({ variant: "primary", size: "sm" })}
                  >
                    Crear dataset
                  </Link>
                }
              />
            </div>
          ) : (
            <form
              className="mt-5 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                void launch();
              }}
            >
              <div className="grid gap-5 sm:grid-cols-2 sm:max-w-xl">
                <Select
                  label="Dataset"
                  name="dataset"
                  value={datasetId}
                  onChange={(event) => setDatasetId(event.target.value)}
                  hint="La compatibilidad de formas la valida la API."
                  disabled={network.state === "training"}
                >
                  <option value="">Elige un dataset…</option>
                  {datasets.map((dataset) => (
                    <option key={dataset.id} value={String(dataset.id)}>
                      {dataset.name} — {formatNumber(dataset.total_rows)} filas ·{" "}
                      {formatNumber(dataset.input_cols)}→
                      {formatNumber(dataset.output_cols)}
                    </option>
                  ))}
                </Select>

                <fieldset
                  className="space-y-2"
                  disabled={network.state === "training"}
                >
                  <legend className="block text-sm font-medium text-ink-900">
                    Modalidad
                  </legend>
                  <div className="flex flex-col gap-2 pt-1">
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-[3px] border border-ink-950/15 bg-paper-50 px-3 py-2.5 text-sm hover:border-electric-400/40">
                      <input
                        type="radio"
                        name="mode"
                        value="live"
                        checked={mode === "live"}
                        onChange={() => setMode("live")}
                        className="mt-1 size-3.5 accent-electric-400"
                      />
                      <span>
                        <span className="block font-medium text-ink-900">
                          En vivo
                        </span>
                        <span className="block text-xs leading-5 text-ink-600">
                          Curva época a época, con cancelación.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-[3px] border border-ink-950/15 bg-paper-50 px-3 py-2.5 text-sm hover:border-electric-400/40">
                      <input
                        type="radio"
                        name="mode"
                        value="oneshot"
                        checked={mode === "oneshot"}
                        onChange={() => setMode("oneshot")}
                        className="mt-1 size-3.5 accent-electric-400"
                      />
                      <span>
                        <span className="block font-medium text-ink-900">
                          One-shot
                        </span>
                        <span className="block text-xs leading-5 text-ink-600">
                          Espera hasta el resultado, sin curva.
                        </span>
                      </span>
                    </label>
                  </div>
                </fieldset>
              </div>

              <dl className="grid grid-cols-2 divide-ink-950/10 border-y border-ink-950/10 text-sm sm:grid-cols-4 sm:divide-x">
                <ProgressStat
                  label="Épocas"
                  value={formatNumber(network.epochs)}
                />
                <ProgressStat
                  label="Learning rate"
                  value={String(network.learning_rate)}
                />
                <ProgressStat label="Pérdida" value={network.loss.toUpperCase()} />
                <ProgressStat
                  label="Split"
                  value={`${Math.round(network.training_split * 100)} / ${100 - Math.round(network.training_split * 100)}`}
                />
              </dl>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  disabled={
                    !datasetId || network.state === "training" || busy
                  }
                >
                  Entrenar
                </Button>
                <p className="text-xs text-ink-600">
                  {mode === "live"
                    ? "La corrida en vivo se puede cancelar en cualquier momento."
                    : "La corrida one-shot no muestra épocas ni curva."}
                </p>
              </div>
            </form>
          )}
        </section>
      ) : null}

      {status === "starting" || status === "live" ? (
        <section
          aria-live="polite"
          className="surface space-y-5 rounded-[3px] p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-lg font-normal text-ink-950">
              {mode === "oneshot"
                ? "Entrenamiento en curso"
                : "Entrenamiento en vivo"}
            </h2>
            <StateBadge state={network.state} />
          </div>

          {mode === "oneshot" ? (
            <div className="flex items-start gap-3 rounded-[3px] border border-electric-400/25 bg-electric-400/[0.05] px-4 py-3 text-sm text-ink-800">
              <Spinner className="mt-0.5 shrink-0" />
              <p>
                Entrenando en modo one-shot. Esta modalidad espera el resultado
                final sin mostrar épocas ni curva simuladas.
              </p>
            </div>
          ) : (
            <>
              {!startInfo ? (
                <div className="flex items-center gap-3 text-sm text-ink-600">
                  <Spinner />
                  Abriendo la corriente de eventos…
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-mono text-sm text-ink-900">
                        Época {formatNumber(currentEpoch)} de{" "}
                        {formatNumber(startInfo.epochs)}
                      </p>
                      <p className="font-mono text-xs text-ink-500">
                        {progressPercent} %
                      </p>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={startInfo.epochs}
                      aria-valuenow={currentEpoch}
                      aria-label="Progreso del entrenamiento"
                      className="mt-2 h-2 overflow-hidden rounded-full bg-ink-950/10"
                    >
                      <div
                        className="h-full bg-electric-400 transition-[width] duration-150"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-ink-600">
                      {formatNumber(startInfo.train_rows)} ejemplos de
                      entrenamiento · {formatNumber(startInfo.test_rows)} de test
                    </p>
                  </div>

                  <dl className="grid grid-cols-2 divide-ink-950/10 border-y border-ink-950/10 text-sm sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
                    <ProgressStat
                      label="Pérdida train"
                      value={formatLossValue(lastTrain)}
                    />
                    <ProgressStat
                      label="Pérdida test"
                      value={formatLossValue(lastTest)}
                    />
                    <ProgressStat
                      label="Transcurrido"
                      value={formatDuration(elapsedMs)}
                    />
                    <ProgressStat
                      label="Restante"
                      value={
                        remainingMs > 0 && currentEpoch > 0
                          ? `~ ${formatDuration(remainingMs)}`
                          : "—"
                      }
                    />
                    <ProgressStat
                      label="Learning rate"
                      value={String(network.learning_rate)}
                    />
                    <ProgressStat
                      label="Época actual"
                      value={formatNumber(currentEpoch)}
                    />
                  </dl>

                  <LossChart
                    train={series.train}
                    test={series.test}
                    totalEpochs={startInfo.epochs}
                  />
                </>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="danger" onClick={handleCancel}>
                  Cancelar corrida
                </Button>
                <p className="text-xs text-ink-600">
                  Cancelar cierra la corriente: la corrida no deja run y la red
                  vuelve a borrador.
                </p>
              </div>
            </>
          )}
        </section>
      ) : null}

      {status === "finished" && run ? (
        <div className="space-y-5">
          <TrainingResult run={run} />
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/networks/${id}`}
              className={buttonStyles({ variant: "primary", size: "sm" })}
            >
              Ver la red entrenada
            </Link>
            <Button variant="secondary" size="sm" onClick={handleBackToIdle}>
              Entrenar de nuevo
            </Button>
          </div>
        </div>
      ) : null}

      {status === "cancelled" ? (
        <Alert
          tone="warning"
          title="Corrida cancelada"
          actions={
            <Button variant="secondary" size="sm" onClick={handleBackToIdle}>
              Entrenar de nuevo
            </Button>
          }
        >
          La corrida se canceló antes del evento final: no hay run y la red ha
          vuelto a borrador.
        </Alert>
      ) : null}

      {status === "interrupted" ? (
        <Alert
          tone="warning"
          title="La corriente se cortó"
          actions={
            <Button variant="primary" size="sm" onClick={() => void launch()}>
              Relanzar desde la primera época
            </Button>
          }
        >
          La corriente de eventos se interrumpió por un fallo ajeno a tu
          acción: la corrida se canceló sin run. Puedes relanzarla desde la
          época 1.
        </Alert>
      ) : null}

      {status === "error" && streamError ? (
        <Alert
          tone="error"
          title={`El entrenamiento falló (${streamError.code})`}
          actions={
            <Button variant="secondary" size="sm" onClick={handleBackToIdle}>
              Entrenar de nuevo
            </Button>
          }
        >
          {streamError.message} El estado final de la red es el que informa la
          API.
        </Alert>
      ) : null}

      {status !== "idle" ? (
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/networks/${id}`}
            className={buttonStyles({ variant: "ghost", size: "sm" })}
          >
            Volver al detalle
          </Link>
        </div>
      ) : null}
    </div>
  );
}
