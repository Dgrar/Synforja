import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { SessionProvider } from "@/components/session/SessionProvider";
import { NavigationGuardProvider } from "@/components/session/NavigationGuard";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Synforja — Laboratorio de redes neuronales",
    template: "%s · Synforja",
  },
  description:
    "Diseña, entrena y ejecuta redes neuronales simples sin escribir código.",
  applicationName: "Synforja",
};

export const viewport: Viewport = {
  themeColor: "#070b09",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full font-sans antialiased">
        <SessionProvider>
          <NavigationGuardProvider>{children}</NavigationGuardProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
