import type { ReactNode } from "react";

import { AppShell } from "@/components/app/AppShell";
import { AuthGuard } from "@/components/session/AuthGuard";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
