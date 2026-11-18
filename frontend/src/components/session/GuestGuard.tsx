"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { SessionSplash } from "@/components/session/SessionSplash";
import { useSession } from "@/components/session/SessionProvider";
import { readNextPath } from "@/lib/navigation";

export function GuestGuard({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(readNextPath());
    }
  }, [router, status]);

  if (status === "loading") {
    return <SessionSplash message="Preparando el acceso" />;
  }

  if (status === "authenticated") {
    return <SessionSplash message="Abriendo tu laboratorio" />;
  }

  return <>{children}</>;
}
