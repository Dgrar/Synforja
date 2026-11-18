"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { useSession } from "@/components/session/SessionProvider";
import { Alert } from "@/components/ui/Alert";
import { BrandMark } from "@/components/ui/BrandMark";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Panel", icon: "dashboard" },
  { href: "/networks", label: "Redes", icon: "networks" },
  { href: "/datasets", label: "Datasets", icon: "datasets" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobilePath, setMobilePath] = useState(pathname);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const drawerOpen = mobileOpen && mobilePath === pathname;

  function openMobile() {
    setMobilePath(pathname);
    setMobileOpen(true);
  }

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen]);

  async function handleLogout() {
    setLogoutError(null);
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/login");
    } catch (logoutFailure) {
      setLogoutError(errorMessage(logoutFailure));
    } finally {
      setLoggingOut(false);
    }
  }

  const sidebar = (
    <SidebarBody
      pathname={pathname}
      username={user?.username ?? ""}
      email={user?.email ?? ""}
      loggingOut={loggingOut}
      logoutError={logoutError}
      onLogout={handleLogout}
      onNavigate={() => setMobileOpen(false)}
    />
  );

  return (
    <div className="min-h-dvh bg-ink-950">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-white/[0.07] bg-ink-900/65 backdrop-blur-xl lg:flex">
        {sidebar}
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-ink-950/70 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-5 sm:px-8 lg:px-10">
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-xl border border-white/[0.08] text-mist-200 transition hover:bg-white/[0.06] lg:hidden"
              aria-label="Abrir menú"
              aria-expanded={drawerOpen}
              aria-controls="mobile-navigation"
              onClick={openMobile}
            >
              <Icon name="menu" className="size-5" />
            </button>

            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-mist-100">
                Laboratorio
              </p>
              <p className="truncate text-[0.68rem] uppercase tracking-[0.18em] text-mist-500">
                Synforja · No-code
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <span className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[0.68rem] text-mist-400 sm:inline-flex">
                <span className="size-1.5 rounded-full bg-mint-400" />
                Sesión activa
              </span>
              <span className="flex size-9 items-center justify-center rounded-full border border-mint-400/20 bg-mint-400/[0.09] text-xs font-semibold text-mint-300">
                {initials(user?.username ?? "S")}
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[90rem] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Navegación principal"
            className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] animate-[fade-up_220ms_ease-out_both] flex-col border-r border-white/[0.1] bg-ink-900 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] p-5">
              <BrandMark />
              <button
                type="button"
                className="inline-flex size-9 items-center justify-center rounded-lg text-mist-400 transition hover:bg-white/[0.06] hover:text-mist-100"
                aria-label="Cerrar menú"
                onClick={() => setMobileOpen(false)}
              >
                <Icon name="close" className="size-5" />
              </button>
            </div>
            {sidebar}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function SidebarBody({
  pathname,
  username,
  email,
  loggingOut,
  logoutError,
  onLogout,
  onNavigate,
}: {
  pathname: string;
  username: string;
  email: string;
  loggingOut: boolean;
  logoutError: string | null;
  onLogout: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="hidden border-b border-white/[0.07] p-6 lg:block">
        <BrandMark />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4 lg:p-5">
        <p className="px-3 pb-2 text-[0.62rem] font-medium uppercase tracking-[0.22em] text-mist-500">
          Espacio de trabajo
        </p>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active
                  ? "bg-mint-400/[0.09] text-mint-200"
                  : "text-mist-400 hover:bg-white/[0.045] hover:text-mist-100",
              )}
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg border transition",
                  active
                    ? "border-mint-400/20 bg-mint-400/[0.08] text-mint-300"
                    : "border-transparent text-mist-500 group-hover:text-mist-300",
                )}
              >
                <Icon name={item.icon} className="size-4" />
              </span>
              {item.label}
              {active ? (
                <span className="ml-auto size-1.5 rounded-full bg-mint-400" />
              ) : null}
            </Link>
          );
        })}

        <div className="pt-5">
          <p className="px-3 pb-2 text-[0.62rem] font-medium uppercase tracking-[0.22em] text-mist-500">
            Próximamente
          </p>
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-mist-500/70">
            <span className="flex size-8 items-center justify-center rounded-lg border border-dashed border-white/[0.09]">
              <Icon name="activity" className="size-4" />
            </span>
            Entrenamiento en vivo
          </div>
        </div>
      </nav>

      <div className="border-t border-white/[0.07] p-4 lg:p-5">
        {logoutError ? (
          <Alert tone="error" className="mb-3 text-xs">
            {logoutError}
          </Alert>
        ) : null}
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-mist-100 text-xs font-semibold text-ink-900">
            {initials(username || "S")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-mist-100">
              {username || "Sin nombre"}
            </p>
            <p className="truncate text-xs text-mist-500">{email}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-mist-400 transition hover:bg-white/[0.06] hover:text-mist-100 disabled:opacity-50"
          >
            {loggingOut ? (
              <Spinner className="size-3.5" />
            ) : (
              <Icon name="logout" className="size-4" />
            )}
          </button>
        </div>
        <p className="mt-3 text-center text-[0.62rem] uppercase tracking-[0.18em] text-mist-500/60">
          Synforja · 2026
        </p>
      </div>
    </div>
  );
}
