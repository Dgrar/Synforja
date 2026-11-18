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
    <div className="overflow-hidden rounded-xl border border-coral-400/20">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <caption className="sr-only">
            Violaciones detectadas en el dataset
          </caption>
          <thead className="bg-coral-400/[0.06] text-coral-300">
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
          <tbody className="divide-y divide-coral-400/10 text-mist-300">
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
      <p className="border-t border-coral-400/10 bg-coral-400/[0.04] px-3 py-2 text-[0.68rem] text-coral-300/90">
        {total > violations.length
          ? `Mostrando ${formatNumber(violations.length)} de ${formatNumber(total)} violaciones.`
          : `${formatNumber(total)} ${total === 1 ? "violación" : "violaciones"}.`}
      </p>
    </div>
  );
}
