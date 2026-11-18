"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { QueryError } from "@/components/app/QueryError";
import { NetworkForm } from "@/components/networks/NetworkForm";
import { buttonStyles } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useApiQuery } from "@/lib/hooks/useApiQuery";
import type { Network } from "@/lib/types/api";

export default function EditNetworkPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isInteger(id) && id > 0;
  const { data: network, error, loading, reload } = useApiQuery<Network>(
    `/networks/${validId ? id : 0}`,
  );

  if (!validId) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-mist-400">La red solicitada no es válida.</p>
        <Link
          href="/networks"
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          Volver a redes
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full max-w-xl" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <Skeleton className="h-[34rem] rounded-2xl" />
          <Skeleton className="h-[28rem] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!network) {
    return (
      <div className="space-y-6">
        <QueryError error={error} onRetry={reload} />
        <Link
          href="/networks"
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          Volver a redes
        </Link>
      </div>
    );
  }

  return <NetworkForm network={network} />;
}
