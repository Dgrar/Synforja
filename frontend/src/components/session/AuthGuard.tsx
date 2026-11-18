"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { SessionSplash } from "@/components/session/SessionSplash";
import { useSession } from "@/components/session/SessionProvider";
import { currentPrivatePath, loginPath } from "@/lib/navigation";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status !== "anonymous") {
      return;
    }

    router.replace(loginPath(currentPrivatePath(pathname)));
  }, [pathname, router, status]);

  if (status !== "authenticated") {
    return (
      <SessionSplash
        message={
          status === "anonymous"
            ? "Llevándote al acceso"
            : "Comprobando tu sesión"
        }
      />
    );
  }

  return <>{children}</>;
}
