import type { Metadata } from "next";

import { NetworksView } from "@/components/app/NetworksView";

export const metadata: Metadata = {
  title: "Redes",
};

export default function NetworksPage() {
  return <NetworksView />;
}
