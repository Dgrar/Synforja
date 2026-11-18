"use client";

import { useParams } from "next/navigation";

import { NetworkDetail } from "@/components/networks/NetworkDetail";

export default function NetworkDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return <NetworkDetail id={id} />;
}
