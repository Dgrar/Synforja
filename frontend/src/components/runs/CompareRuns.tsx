import { formatMetric, formatNumber } from "@/lib/format";
import type { Run } from "@/lib/types/api";

function CompareRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-ink-600">{label}</dt>
      <dd className="font-mono text-xs text-ink-900">{value}</dd>
    </div>
  );
}

export function CompareRuns({ runs }: { runs: Run[] }) {
  return (
    <section className="surface rounded-[3px] p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-normal text-ink-950">
            Comparación
          </h2>
          <p className="mt-1 text-xs leading-5 text-ink-600">
            Métricas y dataset de origen de cada corrida, lado a lado. La
            selección no se guarda al recargar.
          </p>
        </div>
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-ink-500">
          {runs.length} corridas
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {runs.map((run) => (
          <article
            key={run.id}
            className="rounded-[3px] border border-ink-950/15 bg-paper-50 p-4"
          >
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-ink-500">
              Run #{run.id}
            </p>
            <dl className="mt-3 space-y-2.5">
              <CompareRow
                label="Pérdida (MSE)"
                value={formatMetric(run.mse_loss)}
              />
              <CompareRow label="R²" value={formatMetric(run.r_square)} />
              <CompareRow
                label="Precisión"
                value={formatMetric(run.accuracy)}
              />
              <CompareRow label="Dataset" value={`#${run.dataset.id}`} />
              <CompareRow
                label="Filas"
                value={formatNumber(run.dataset.total_rows)}
              />
              <CompareRow
                label="Forma"
                value={`${formatNumber(run.dataset.input_cols)} → ${formatNumber(
                  run.dataset.output_cols,
                )}`}
              />
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
