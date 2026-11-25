import { formatNumber } from "@/lib/format";
import type { Run } from "@/lib/types/api";

function formatMetric(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return String(Number(value.toPrecision(6)));
}

export function TrainingResult({ run }: { run: Run }) {
  return (
    <section className="rounded-[3px] border border-electric-400/25 bg-electric-400/[0.05] p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg font-normal text-ink-950">
          Corrida finalizada
        </h2>
        <span className="rounded-full border border-ink-950/15 px-2.5 py-1 font-mono text-[0.62rem] text-ink-500">
          run #{run.id}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-ink-600">
        Métricas de test devueltas por la API. La red queda entrenada con estos
        pesos.
      </p>

      <dl className="mt-5 grid grid-cols-1 divide-y divide-ink-950/10 border-y border-ink-950/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="py-4 sm:px-4 sm:first:pl-0">
          <dt className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-ink-500">
            Pérdida (MSE)
          </dt>
          <dd className="mt-1.5 font-serif text-2xl text-ink-950">
            {formatMetric(run.mse_loss)}
          </dd>
        </div>
        <div className="py-4 sm:px-4">
          <dt className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-ink-500">
            R²
          </dt>
          <dd className="mt-1.5 font-serif text-2xl text-ink-950">
            {formatMetric(run.r_square)}
          </dd>
        </div>
        <div className="py-4 sm:px-4 sm:last:pr-0">
          <dt className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-ink-500">
            Precisión
          </dt>
          <dd className="mt-1.5 font-serif text-2xl text-ink-950">
            {formatMetric(run.accuracy)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs leading-5 text-ink-600">
        Dataset de la corrida: {formatNumber(run.dataset.total_rows)} filas ·{" "}
        {formatNumber(run.dataset.input_cols)} entradas ·{" "}
        {formatNumber(run.dataset.output_cols)} salidas.
      </p>
    </section>
  );
}
