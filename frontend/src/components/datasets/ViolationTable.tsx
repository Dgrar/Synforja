import { formatNumber } from "@/lib/format";
import type { DatasetViolation } from "@/lib/types/api";

export function ViolationTable({
  violations,
  total,
}: {
  violations: DatasetViolation[];
  total: number;
}) {
  if (violations.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-[3px] border border-vermilion-400/20">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <caption className="sr-only">
            Violaciones detectadas en el dataset
          </caption>
          <thead className="bg-vermilion-400/[0.08] font-mono text-[0.6rem] uppercase tracking-[0.1em] text-vermilion-500">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Fila
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Columna
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Motivo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-vermilion-400/10 text-ink-700">
            {violations.map((violation, index) => (
              <tr key={`${violation.row}-${violation.col}-${index}`}>
                <td className="whitespace-nowrap px-3 py-2 font-mono">
                  {violation.row || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono">
                  {violation.col || "—"}
                </td>
                <td className="min-w-56 px-3 py-2">{violation.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-vermilion-400/15 bg-vermilion-400/[0.05] px-3 py-2 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-vermilion-500">
        {total > violations.length
          ? `Mostrando ${formatNumber(violations.length)} de ${formatNumber(total)} violaciones.`
          : `${formatNumber(total)} ${total === 1 ? "violación" : "violaciones"}.`}
      </p>
    </div>
  );
}
