"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { QueryError } from "@/components/app/QueryError";
import { StateBadge } from "@/components/app/StateBadge";
import { CompareRuns } from "@/components/runs/CompareRuns";
import { RunsTable } from "@/components/runs/RunsTable";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatNumber, pluralize } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks/useApiQuery";
import { MAX_COMPARE_RUNS, toggleRunSelection } from "@/lib/runs/compare";
import type { Network, Run } from "@/lib/types/api";

export function RunsPanel({ id }: { id: number }) {
  const networkQuery = useApiQuery<Network>(`/networks/${id}`);
  const runsQuery = useApiQuery<Run[]>(`/networks/${id}/runs`);
  const [selected, setSelected] = useState<number[]>([]);
  const [limitReached, setLimitReached] = useState(false);

  const network = networkQuery.data;
  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);
  const compared = useMemo(
    () => runs.filter((run) => selected.includes(run.id)),
    [runs, selected],
  );

  function handleToggle(runId: number) {
    const result = toggleRunSelection(selected, runId);
    setSelected(result.selected);
    setLimitReached(result.rejected);
  }

  if (networkQuery.loading && !network) {
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
        <QueryError error={networkQuery.error} onRetry={networkQuery.reload} />
        <Link
          href="/networks"
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          Volver a redes
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Red · corridas"
        title={`Corridas de ${network.name}`}
        description="Resultados persistidos del entrenamiento, de la más reciente a la más antigua. Selecciona entre dos y cuatro para compararlas."
        actions={
          <>
            <Link
              href={`/networks/${network.id}`}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              Volver
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={runsQuery.reload}
              icon={<Icon name="refresh" className="size-4" />}
            >
              Actualizar
            </Button>
            <StateBadge state={network.state} />
          </>
        }
      />

      {runsQuery.error ? (
        <QueryError error={runsQuery.error} onRetry={runsQuery.reload} />
      ) : null}

      {limitReached ? (
        <Alert tone="warning" title="Límite de comparación">
          Puedes comparar como máximo {MAX_COMPARE_RUNS} corridas a la vez.
          Desmarca una para añadir otra.
        </Alert>
      ) : null}

      {selected.length === 1 ? (
        <Alert tone="info" title="Selecciona otra corrida">
          La comparación necesita al menos dos corridas y admite hasta{" "}
          {MAX_COMPARE_RUNS}.
        </Alert>
      ) : null}

      {runsQuery.loading && !runsQuery.data ? (
        <Skeleton className="h-64 rounded-[3px]" />
      ) : runs.length === 0 ? (
        <EmptyState
          icon="activity"
          title="Aún no hay corridas"
          description={
            network.state === "trained"
              ? "Esta red está entrenada pero no conserva corridas registradas. Lanza una nueva para ver sus métricas aquí."
              : "Cuando entrenes esta red aparecerán aquí sus métricas finales y el dataset de origen de cada corrida."
          }
          action={
            <Link
              href={`/networks/${network.id}/train`}
              className={buttonStyles({ size: "sm" })}
            >
              Entrenar la red
            </Link>
          }
        />
      ) : (
        <>
          <RunsTable runs={runs} selected={selected} onToggle={handleToggle} />
          <p className="text-xs text-ink-600">
            {formatNumber(runs.length)}{" "}
            {pluralize(runs.length, "corrida registrada", "corridas registradas")}
            . El snapshot del dataset se conserva aunque el dataset se elimine.
          </p>
          {compared.length >= 2 ? <CompareRuns runs={compared} /> : null}
        </>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/networks/${network.id}`}
          className={buttonStyles({ variant: "ghost", size: "sm" })}
        >
          Volver al detalle
        </Link>
        {network.state === "trained" ? (
          <Link
            href={`/networks/${network.id}/predict`}
            className={buttonStyles({ variant: "ghost", size: "sm" })}
          >
            Predecir
          </Link>
        ) : null}
      </div>
    </div>
  );
}
