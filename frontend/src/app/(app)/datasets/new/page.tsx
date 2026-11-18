import type { Metadata } from "next";

import { DatasetForm } from "@/components/datasets/DatasetForm";

export const metadata: Metadata = {
  title: "Nuevo dataset",
};

export default function NewDatasetPage() {
  return <DatasetForm />;
}
