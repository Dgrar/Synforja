"use client";

import { useParams } from "next/navigation";

import { DatasetDetail } from "@/components/datasets/DatasetDetail";

export default function DatasetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return <DatasetDetail id={id} />;
}
