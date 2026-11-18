import type { ReactNode } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { GuestGuard } from "@/components/session/GuestGuard";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <GuestGuard>
      <AuthShell>{children}</AuthShell>
    </GuestGuard>
  );
}
