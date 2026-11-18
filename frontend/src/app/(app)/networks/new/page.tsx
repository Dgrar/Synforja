import type { Metadata } from "next";

import { NetworkForm } from "@/components/networks/NetworkForm";

export const metadata: Metadata = {
  title: "Nueva red",
};

export default function NewNetworkPage() {
  return <NetworkForm />;
}
