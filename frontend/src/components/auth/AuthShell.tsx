import type { ReactNode } from "react";

import { BrandMark } from "@/components/ui/BrandMark";
import { Icon } from "@/components/ui/Icon";

const features = [
  {
    icon: "layers" as const,
    title: "Diseño visual",
    text: "Capas, neuronas y activaciones en un grafo claro.",
  },
  {
    icon: "activity" as const,
    title: "Entrenamiento observable",
    text: "La pérdida avanza época a época, para que puedas seguir el proceso.",
  },
  {
    icon: "database" as const,
    title: "Tus datos, tus reglas",
    text: "Datasets CSV o JSON validados antes de entrenar.",
  },
];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-grid opacity-30 [mask-image:radial-gradient(circle_at_30%_20%,black,transparent_65%)]"
      />

      <div className="relative mx-auto grid min-h-dvh w-full max-w-[1500px] lg:grid-cols-[minmax(0,1fr)_minmax(430px,0.86fr)]">
        <main className="flex min-h-dvh flex-col px-6 py-7 sm:px-10 lg:px-16 xl:px-24">
          <div className="animate-fade-up">
            <BrandMark />
          </div>

          <div className="flex flex-1 items-center py-10">
            <div className="w-full max-w-[27rem] animate-fade-up">{children}</div>
          </div>

          <p className="text-xs text-ink-500">
            © 2026 Synforja · Laboratorio de redes neuronales
          </p>
        </main>

        <aside className="relative hidden overflow-hidden border-l border-ink-950/20 bg-paper-200 p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div
            aria-hidden="true"
            className="absolute -right-32 -top-24 size-[32rem] rounded-full bg-electric-400/[0.09] blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-40 -left-20 size-[26rem] rounded-full bg-electric-600/[0.06] blur-3xl"
          />

          <div className="relative">
            <span className="inline-flex items-center gap-2 border border-electric-400/25 bg-electric-400/[0.06] px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-electric-500">
              <span className="size-1.5 rounded-full bg-electric-500" />
              Aprende cada paso
            </span>
            <h2 className="mt-7 max-w-md font-serif text-4xl font-normal leading-[1.05] tracking-tight text-ink-950 xl:text-[3.4rem]">
              De la idea a la{" "}
              <span className="text-vermilion-500 italic">inferencia</span>.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-ink-600">
              Un laboratorio para entender qué pasa dentro de una red neuronal
              mientras la construyes, la entrenas y la pones a prueba.
            </p>
          </div>

          <div className="relative my-10">
            <NetworkIllustration />
          </div>

          <ul className="relative space-y-4">
            {features.map((feature) => (
              <li key={feature.title} className="flex gap-3.5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[3px] border border-ink-950/15 bg-paper-50 text-electric-500">
                  <Icon name={feature.icon} className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink-900">
                    {feature.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-ink-600">
                    {feature.text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function NetworkIllustration() {
  const nodes = [
    [80, 78],
    [80, 160],
    [80, 242],
    [242, 52],
    [242, 134],
    [242, 216],
    [242, 298],
    [404, 102],
    [404, 184],
    [404, 266],
    [520, 184],
  ] as const;

  const edges = [
    [0, 3],
    [0, 4],
    [0, 5],
    [1, 3],
    [1, 4],
    [1, 5],
    [1, 6],
    [2, 4],
    [2, 5],
    [2, 6],
    [3, 7],
    [3, 8],
    [4, 7],
    [4, 8],
    [5, 8],
    [5, 9],
    [6, 8],
    [6, 9],
    [7, 10],
    [8, 10],
    [9, 10],
  ] as const;

  return (
    <svg
      viewBox="0 0 580 340"
      aria-hidden="true"
      className="w-full max-w-lg text-electric-400"
    >
      <defs>
        <linearGradient id="auth-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.08" />
          <stop offset="0.55" stopColor="currentColor" stopOpacity="0.34" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.1" />
        </linearGradient>
        <radialGradient id="auth-node" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.25" />
        </radialGradient>
      </defs>

      <g stroke="url(#auth-edge)" strokeWidth="1">
        {edges.map(([from, to]) => (
          <line
            key={`${from}-${to}`}
            x1={nodes[from][0]}
            y1={nodes[from][1]}
            x2={nodes[to][0]}
            y2={nodes[to][1]}
          />
        ))}
      </g>

      <g>
        {nodes.map(([x, y], index) => (
          <g key={`${x}-${y}`}>
            <circle
              cx={x}
              cy={y}
              r={index === 0 || index === 10 ? 13 : 8}
              fill="url(#auth-node)"
              stroke="currentColor"
              strokeOpacity={index === 0 || index === 10 ? 0.65 : 0.32}
            />
            {index === 0 || index === 10 ? (
              <circle
                cx={x}
                cy={y}
                r="21"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.14"
                strokeDasharray="3 5"
              />
            ) : null}
          </g>
        ))}
      </g>
    </svg>
  );
}
