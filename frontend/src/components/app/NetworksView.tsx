"use client";

import Link from "next/link";

import { NetworkRow } from "@/components/app/NetworkRow";
import { QueryError } from "@/components/app/QueryError";
import { Button, buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/useApiQuery";
import { formatNumber, pluralize } from "@/lib/format";
import type { Network } from "@/lib/types/api";

export function NetworksView() {
  const { data, error, loading, reload } = useApiQuery<Network[]>("/networks");
  const networks = data ?? [];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Biblioteca"
        title="Redes"
        description="Tus arquitecturas guardadas, con su topología y estado de entrenamiento."
        actions={
          <>
            <Link
              href="/networks/new"
              className={buttonStyles({ variant: "primary", size: "sm" })}
            >
              <Icon name="plus" className="size-4" />
              Nueva red
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
        <div className="surface rounded-2xl p-5 sm:p-6">
          <div className="space-y-5">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="flex items-center gap-3.5">
                <Skeleton className="size-10 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : networks.length === 0 ? (
        <EmptyState
          icon="networks"
          title="Aún no hay redes"
          description="Las redes que crees aparecerán aquí con su número de capas, neuronas y estado actual."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href="/networks/new"
                className={buttonStyles({ size: "sm" })}
              >
                <Icon name="plus" className="size-4" />
                Crear primera red
              </Link>
              <Button variant="secondary" size="sm" onClick={reload}>
                Volver a comprobar
              </Button>
            </div>
          }
        />
      ) : (
        <section className="surface overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4 sm:px-6">
            <p className="text-xs text-mist-400">
              {formatNumber(networks.length)}{" "}
              {pluralize(networks.length, "red", "redes")}
            </p>
            <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-mist-500">
              <span className="size-1.5 rounded-full bg-mint-400" />
              Sincronizado con la API
            </span>
          </div>
          <div className="divide-y divide-white/[0.06] px-5 sm:px-6">
            {networks.map((network) => (
              <NetworkRow key={network.id} network={network} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
