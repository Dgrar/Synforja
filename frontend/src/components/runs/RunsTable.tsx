import { cn } from "@/lib/cn";
import { formatMetric, formatNumber } from "@/lib/format";
import { MAX_COMPARE_RUNS } from "@/lib/runs/compare";
import type { Run } from "@/lib/types/api";

export function RunsTable({
  runs,
  selected,
  onToggle,
}: {
  runs: Run[];
  selected: number[];
  onToggle: (runId: number) => void;
}) {
  return (
    <section className="surface overflow-hidden rounded-[3px]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-950/15 px-5 py-4 sm:px-6">
        <p className="text-xs text-ink-600">
          {formatNumber(runs.length)} corridas · la más reciente primero
        </p>
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-ink-500">
          {selected.length} de {MAX_COMPARE_RUNS} seleccionadas
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <caption className="sr-only">
            Corridas de la red, ordenadas de la más reciente a la más antigua.
          </caption>
          <thead>
            <tr className="border-b border-ink-950/10 text-left font-mono text-[0.6rem] uppercase tracking-[0.14em] text-ink-500">
              <th scope="col" className="w-20 px-5 py-3 sm:px-6">
                Comparar
              </th>
              <th scope="col" className="px-3 py-3">
                Run
              </th>
              <th scope="col" className="px-3 py-3 text-right">
                Pérdida
              </th>
              <th scope="col" className="px-3 py-3 text-right">
                R²
              </th>
              <th scope="col" className="px-3 py-3 text-right">
                Precisión
              </th>
              <th scope="col" className="px-3 py-3">
                Dataset
              </th>
              <th scope="col" className="px-3 py-3 pr-5 text-right sm:pr-6">
                Forma
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-950/10">
            {runs.map((run) => {
              const checked = selected.includes(run.id);
              return (
                <tr
                  key={run.id}
                  className={cn("transition", checked && "bg-electric-400/[0.05]")}
                >
                  <td className="px-5 py-3 sm:px-6">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(run.id)}
                      aria-label={`Comparar la corrida ${run.id}`}
                      className="size-4 cursor-pointer accent-electric-400"
                    />
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-ink-900">
                    #{run.id}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs text-ink-900">
                    {formatMetric(run.mse_loss)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs text-ink-900">
                    {formatMetric(run.r_square)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs text-ink-900">
                    {formatMetric(run.accuracy)}
                  </td>
                  <td className="px-3 py-3 text-ink-800">Dataset #{run.dataset.id}</td>
                  <td className="px-3 py-3 pr-5 text-right font-mono text-xs text-ink-600 sm:pr-6">
                    {formatNumber(run.dataset.total_rows)} filas ·{" "}
                    {formatNumber(run.dataset.input_cols)}→
                    {formatNumber(run.dataset.output_cols)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
