import { formatNumber } from "@/lib/format";

const MAX_POINTS = 2000;

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 260;
const MARGIN = { top: 16, right: 14, bottom: 30, left: 52 };

const TRAIN_COLOR = "#1f43ff";
const TEST_COLOR = "#9a651a";

function formatLoss(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (value === 0) {
    return "0";
  }
  if (Math.abs(value) < 0.001 || Math.abs(value) >= 10000) {
    return value.toExponential(1);
  }
  return String(Number(value.toPrecision(3)));
}

function sampleIndices(count: number): number[] {
  if (count <= MAX_POINTS) {
    return Array.from({ length: count }, (_, index) => index);
  }
  const stride = Math.ceil(count / MAX_POINTS);
  const indices: number[] = [];
  for (let index = 0; index < count; index += stride) {
    indices.push(index);
  }
  if (indices[indices.length - 1] !== count - 1) {
    indices.push(count - 1);
  }
  return indices;
}

function buildPath(
  values: number[],
  plotWidth: number,
  plotHeight: number,
  xMax: number,
  yMax: number,
): string {
  const indices = sampleIndices(values.length);
  return indices
    .map((index, position) => {
      const x = MARGIN.left + (index / Math.max(1, xMax - 1)) * plotWidth;
      const y = MARGIN.top + plotHeight - (values[index] / yMax) * plotHeight;
      return `${position === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join("");
}

export function LossChart({
  train,
  test,
  totalEpochs,
}: {
  train: number[];
  test: number[];
  totalEpochs: number;
}) {
  const plotWidth = VIEW_WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = VIEW_HEIGHT - MARGIN.top - MARGIN.bottom;
  const pointCount = Math.max(train.length, test.length);
  const xMax = Math.max(totalEpochs, pointCount, 2);
  const allValues = [...train, ...test].filter(
    (value) => Number.isFinite(value) && value >= 0,
  );
  const yMax = Math.max(...allValues, 0) || 1;

  const trainPath = train.length
    ? buildPath(train, plotWidth, plotHeight, xMax, yMax)
    : "";
  const testPath = test.length
    ? buildPath(test, plotWidth, plotHeight, xMax, yMax)
    : "";

  const lastTrain = train[train.length - 1];
  const lastTest = test[test.length - 1];
  const summary =
    pointCount === 0
      ? "Sin épocas registradas todavía."
      : `Curva de pérdida en ${formatNumber(pointCount)} de ${formatNumber(xMax)} épocas. ` +
        `Última pérdida de entrenamiento: ${formatLoss(lastTrain ?? NaN)}. ` +
        `Última pérdida de test: ${formatLoss(lastTest ?? NaN)}.`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure className="rounded-[3px] border border-ink-950/15 bg-paper-50 p-4">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={summary}
        className="block h-auto w-full"
      >
        {yTicks.map((tick) => {
          const y = MARGIN.top + plotHeight - tick * plotHeight;
          return (
            <g key={`y-${tick}`}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth}
                y1={y}
                y2={y}
                stroke="#161610"
                strokeOpacity={tick === 0 ? 0.35 : 0.1}
              />
              <text
                x={MARGIN.left - 8}
                y={y + 3}
                textAnchor="end"
                fill="#716b5c"
                fontSize="10"
              >
                {formatLoss(yMax * tick)}
              </text>
            </g>
          );
        })}

        {xTicks.map((tick) => {
          const x = MARGIN.left + tick * plotWidth;
          return (
            <g key={`x-${tick}`}>
              <line
                x1={x}
                x2={x}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
                stroke="#161610"
                strokeOpacity={0.06}
              />
              <text
                x={x}
                y={MARGIN.top + plotHeight + 18}
                textAnchor={tick === 0 ? "start" : tick === 1 ? "end" : "middle"}
                fill="#716b5c"
                fontSize="10"
              >
                {formatNumber(Math.round(xMax * tick))}
              </text>
            </g>
          );
        })}

        <text
          x={MARGIN.left + plotWidth / 2}
          y={VIEW_HEIGHT - 2}
          textAnchor="middle"
          fill="#98917f"
          fontSize="10"
        >
          Época
        </text>
        <text
          x={12}
          y={MARGIN.top + plotHeight / 2}
          textAnchor="middle"
          fill="#98917f"
          fontSize="10"
          transform={`rotate(-90 12 ${MARGIN.top + plotHeight / 2})`}
        >
          Pérdida
        </text>

        {trainPath ? (
          <path
            d={trainPath}
            fill="none"
            stroke={TRAIN_COLOR}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        ) : null}
        {testPath ? (
          <path
            d={testPath}
            fill="none"
            stroke={TEST_COLOR}
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeDasharray="4 3"
          />
        ) : null}

        {pointCount === 0 ? (
          <text
            x={MARGIN.left + plotWidth / 2}
            y={MARGIN.top + plotHeight / 2}
            textAnchor="middle"
            fill="#98917f"
            fontSize="12"
          >
            La curva aparecerá con la primera época.
          </text>
        ) : null}
      </svg>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-600">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-6"
            style={{ backgroundColor: TRAIN_COLOR }}
          />
          Entrenamiento
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-0.5 w-6 border-t-2 border-dashed"
            style={{ borderColor: TEST_COLOR }}
          />
          Test
        </span>
        <span className="sr-only">{summary}</span>
      </figcaption>
    </figure>
  );
}
