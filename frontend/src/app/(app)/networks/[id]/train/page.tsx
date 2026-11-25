"use client";

import { useParams } from "next/navigation";

import { TrainingPanel } from "@/components/training/TrainingPanel";

export default function NetworkTrainPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return <TrainingPanel id={id} />;
}
