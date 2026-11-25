"use client";

import Link from "next/link";

import { NetworkRow } from "@/components/app/NetworkRow";
import { QueryError } from "@/components/app/QueryError";
import { StatCard } from "@/components/app/StatCard";
import { useSession } from "@/components/session/SessionProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { buttonStyles } from "@/components/ui/Button";
import { useApiQuery } from "@/lib/hooks/useApiQuery";
import { formatNumber } from "@/lib/format";
import type { Dataset, Network } from "@/lib/types/api";

export function Dashboard() {
  const { user } = useSession();
  const networksQuery = useApiQuery<Network[]>("/networks");
  const datasetsQuery = useApiQuery<Dataset[]>("/datasets");

  const networks = networksQuery.data ?? [];
  const datasets = datasetsQuery.data ?? [];
  const loading = networksQuery.loading || datasetsQuery.loading;
  const error = networksQuery.error ?? datasetsQuery.error;
  const trained = networks.filter((network) => network.state === "trained").length;
  const drafts = networks.filter((network) => network.state === "draft").length;
  const totalRows = datasets.reduce((total, dataset) => total + dataset.total_rows, 0);

  function reloadAll() {
    networksQuery.reload();
    datasetsQuery.reload();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Panel"
        title={user ? `Hola, ${user.username}` : "Tu laboratorio"}
        description="Revisa el estado de tus redes, tus datos y el siguiente paso para entrenar."
        actions={
          <Link
            href="/networks"
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            Ver mis redes
            <Icon name="arrow-right" className="size-4" />
          </Link>
        }
      />

      {error ? <QueryError error={error} onRetry={reloadAll} /> : null}

      <section
        aria-label="Resumen del laboratorio"
        className="grid divide-y divide-ink-950/20 border-y-2 border-ink-950 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4"
      >
        <StatCard
          label="Redes"
          value={loading ? "—" : formatNumber(networks.length)}
          hint={loading ? "Cargando…" : `${trained} entrenadas`}
          icon="networks"
          accent
        />
        <StatCard
          label="En borrador"
          value={loading ? "—" : formatNumber(drafts)}
          hint={loading ? "Cargando…" : "Listas para configurar"}
          icon="layers"
        />
        <StatCard
          label="Datasets"
          value={loading ? "—" : formatNumber(datasets.length)}
          hint={loading ? "Cargando…" : "Fuentes disponibles"}
          icon="database"
        />
        <StatCard
          label="Filas de datos"
          value={loading ? "—" : formatNumber(totalRows)}
          hint={loading ? "Cargando…" : "En todos tus datasets"}
          icon="activity"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(290px,0.55fr)]">
        <section className="surface rounded-[3px] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-ink-500">
                Actividad reciente
              </p>
              <h2 className="mt-1.5 font-serif text-xl font-normal text-ink-950">
                Tus redes
              </h2>
            </div>
            <Link
              href="/networks"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-electric-500 transition hover:text-electric-400"
            >
              Ver todas
              <Icon name="arrow-right" className="size-3.5" />
            </Link>
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="space-y-4 py-2">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="flex items-center gap-3.5">
                    <Skeleton className="size-10 shrink-0 rounded-[3px]" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-2.5 w-1/2" />
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : networks.length === 0 ? (
              <EmptyState
                icon="networks"
                title="Tu primer grafo empieza aquí"
                description="Cuando crees una red aparecerá en este panel con su topología y estado."
                className="my-3"
              />
            ) : (
              <div className="divide-y divide-ink-950/10">
                {networks.slice(0, 4).map((network) => (
                  <NetworkRow key={network.id} network={network} />
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="surface rounded-[3px] p-5 sm:p-6">
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-ink-500">
              Ruta rápida
            </p>
            <h2 className="mt-1.5 font-serif text-xl font-normal text-ink-950">
              De datos a inferencia
            </h2>
            <ol className="mt-5 space-y-4">
              {[
                ["01", "Prepara tus datos", "CSV o JSON validado."],
                ["02", "Diseña la red", "Capas, neuronas y activación."],
                ["03", "Entrena y observa", "Pérdida, métricas y runs."],
              ].map(([number, title, text]) => (
                <li key={number} className="flex gap-3">
                  <span className="font-mono text-[0.68rem] leading-5 text-vermilion-400">
                    {number}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink-900">{title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-ink-500">
                      {text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-[3px] border border-electric-400/15 bg-electric-400/[0.045] p-5 sm:p-6">
            <span className="inline-flex size-9 items-center justify-center rounded-[3px] border border-electric-400/25 bg-electric-400/[0.06] text-electric-500">
              <Icon name="spark" className="size-4" />
            </span>
            <h2 className="mt-4 font-serif text-lg font-normal text-ink-950">
              {error ? "No pudimos cargar tus datos" : "Todo listo para empezar"}
            </h2>
            <p className="mt-2 text-xs leading-5 text-ink-600">
              {error
                ? "Comprueba tu conexión e inténtalo de nuevo."
                : "Tus redes y datasets están listos para continuar."}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
