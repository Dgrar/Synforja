import Link from "next/link";

import { StateBadge } from "@/components/app/StateBadge";
import { Icon } from "@/components/ui/Icon";
import { formatNumber } from "@/lib/format";
import type { Network } from "@/lib/types/api";

function topology(network: Network): string {
  const neurons = network.layers.reduce((total, layer) => total + layer.size, 0);
  return `${network.layers.length} capas · ${formatNumber(neurons)} neuronas`;
}

export function NetworkRow({ network }: { network: Network }) {
  return (
    <Link
      href={`/networks/${network.id}`}
      aria-label={`Abrir ${network.name}`}
      className="group -mx-2 flex items-center gap-3.5 rounded-xl px-2 py-3.5 transition hover:bg-white/[0.035]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-mint-300">
        <Icon name="networks" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-mist-50">
          {network.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-mist-500">
          {topology(network)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden font-mono text-[0.68rem] text-mist-500 sm:inline">
          lr {network.learning_rate}
        </span>
        <StateBadge state={network.state} />
        <Icon
          name="chevron-right"
          className="size-4 text-mist-500 transition group-hover:translate-x-0.5 group-hover:text-mint-300"
        />
      </div>
    </Link>
  );
}
