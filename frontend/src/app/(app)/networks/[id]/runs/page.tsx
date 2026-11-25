"use client";

import { useParams } from "next/navigation";

import { RunsPanel } from "@/components/runs/RunsPanel";

export default function NetworkRunsPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return <RunsPanel id={id} />;
}
