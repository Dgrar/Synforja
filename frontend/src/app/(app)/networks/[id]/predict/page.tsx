"use client";

import { useParams } from "next/navigation";

import { PredictForm } from "@/components/predict/PredictForm";

export default function NetworkPredictPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return <PredictForm id={id} />;
}
