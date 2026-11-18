import type { Activation, Layer } from "@/lib/types/api";

const ACTIVATION_COLORS: Record<Activation, string> = {
  relu: "#63e6b6",
  sigmoid: "#7dd3fc",
  tanh: "#c4b5fd",
  softmax: "#f5c96d",
  linear: "#b6c8bb",
};

const MAX_VISUAL_NODES = 12;
const LAYER_WIDTH = 54;
const COLUMN_GAP = 46;
const COLUMN_STEP = LAYER_WIDTH + COLUMN_GAP;

interface PositionedNode {
  x: number;
  y: number;
  color: string;
}

function nodePositions(layer: Layer, index: number, height: number): PositionedNode[] {
  const count = Math.min(Math.max(layer.size, 0), MAX_VISUAL_NODES);
  const color = ACTIVATION_COLORS[layer.activation] ?? ACTIVATION_COLORS.linear;
  const x = 34 + index * COLUMN_STEP + LAYER_WIDTH / 2;
  const center = height / 2 + 8;
  const spacing = 17;

  return Array.from({ length: count }, (_, nodeIndex) => ({
    x,
    y: center + (nodeIndex - (count - 1) / 2) * spacing,
    color,
  }));
}

export function TopologyPreview({ layers }: { layers: Layer[] }) {
  if (layers.length === 0) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-white/12 text-sm text-mist-500">
        Añade al menos dos capas para ver la topología.
      </div>
    );
  }

  const height = 292;
  const columns = layers.map((layer, index) => ({
    layer,
    nodes: nodePositions(layer, index, height),
  }));
  const width = Math.max(360, 34 + (layers.length - 1) * COLUMN_STEP + LAYER_WIDTH + 34);

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-ink-950/40">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Topología de ${layers.length} capas. ${layers
          .map(
            (layer, index) =>
              `Capa ${index + 1}: ${layer.size} neuronas, activación ${layer.activation}`,
          )
          .join(". ")}`}
        className="mx-auto block"
        style={{ width, height }}
      >
        <defs>
          <linearGradient id="topology-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#63e6b6" stopOpacity="0.05" />
            <stop offset="1" stopColor="#7dd3fc" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <rect width={width} height={height} fill="url(#topology-bg)" />

        {columns.slice(0, -1).map((column, index) => {
          const nextNodes = columns[index + 1].nodes;
          const path = column.nodes
            .map((node, nodeIndex) => {
              const nextIndex =
                nextNodes.length === 0
                  ? 0
                  : Math.round(
                      (nodeIndex * (nextNodes.length - 1)) /
                        Math.max(1, column.nodes.length - 1),
                    );
              const nextNode = nextNodes[nextIndex];
              return nextNode
                ? `M${node.x} ${node.y}L${nextNode.x} ${nextNode.y}`
                : "";
            })
            .join("");
          return (
            <path
              key={index}
              d={path}
              fill="none"
              stroke="#9df3ce"
              strokeOpacity={0.14}
              strokeWidth={0.8}
            />
          );
        })}

        {columns.map(({ layer, nodes }, index) => {
          const color = ACTIVATION_COLORS[layer.activation] ?? ACTIVATION_COLORS.linear;
          const x = 34 + index * COLUMN_STEP;
          const label = index === 0 ? "Entrada" : index === layers.length - 1 ? "Salida" : `Oculta ${index}`;
          const displaySize = Number.isFinite(layer.size) ? layer.size : 0;

          return (
            <g key={index}>
              <rect
                x={x}
                y={50}
                width={LAYER_WIDTH}
                height={height - 92}
                rx={16}
                fill="rgba(255,255,255,0.022)"
                stroke={color}
                strokeOpacity={0.22}
              />
              <text
                x={x + LAYER_WIDTH / 2}
                y={24}
                textAnchor="middle"
                fill="#b6c8bb"
                fontSize="10"
                fontWeight="600"
              >
                {label}
              </text>
              <text
                x={x + LAYER_WIDTH / 2}
                y={38}
                textAnchor="middle"
                fill="#687d6e"
                fontSize="9"
              >
                {layer.activation}
              </text>
              {nodes.map((node, nodeIndex) => (
                <circle
                  key={nodeIndex}
                  cx={node.x}
                  cy={node.y}
                  r={5.5}
                  fill={color}
                  fillOpacity={0.22}
                  stroke={color}
                  strokeOpacity={0.85}
                  strokeWidth={1}
                />
              ))}
              {displaySize > MAX_VISUAL_NODES ? (
                <text
                  x={x + LAYER_WIDTH / 2}
                  y={height - 50}
                  textAnchor="middle"
                  fill="#8da395"
                  fontSize="9"
                >
                  +{displaySize - MAX_VISUAL_NODES}
                </text>
              ) : null}
              <text
                x={x + LAYER_WIDTH / 2}
                y={height - 28}
                textAnchor="middle"
                fill="#e1eae3"
                fontSize="10"
                fontWeight="600"
              >
                {displaySize} {displaySize === 1 ? "neurona" : "neuronas"}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
