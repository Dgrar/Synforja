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

  const mobileMenu = (
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
    <div className="min-h-dvh bg-paper-100">
      <header className="sticky top-0 z-30 border-b-2 border-ink-950 bg-paper-100/95 backdrop-blur">
        <div className="mx-auto flex h-[4.5rem] max-w-[96rem] items-center gap-4 px-5 sm:px-8 lg:px-10">
          <Link href="/" aria-label="Ir al panel" className="shrink-0">
            <BrandMark />
          </Link>

          <nav
            aria-label="Navegación principal"
            className="hidden items-center gap-6 lg:flex"
          >
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "py-1 text-sm transition",
                    active
                      ? "font-semibold text-ink-950 underline decoration-2 decoration-vermilion-500 underline-offset-8"
                      : "text-ink-600 hover:text-ink-950",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden items-center gap-2 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-ink-500 sm:inline-flex">
              <span className="size-1.5 rounded-full bg-electric-400" />
              Sesión activa
            </span>
            <span className="flex size-9 items-center justify-center rounded-full border border-ink-950/20 bg-paper-50 text-xs font-semibold text-ink-950">
              {initials(user?.username ?? "S")}
            </span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="hidden size-9 items-center justify-center rounded-[3px] border border-ink-950/15 text-ink-600 transition hover:border-vermilion-400/40 hover:bg-vermilion-400/[0.06] hover:text-vermilion-500 disabled:opacity-50 lg:inline-flex"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              disabled={loggingOut}
            >
              {loggingOut ? (
                <Spinner className="size-3.5" />
              ) : (
                <Icon name="logout" className="size-4" />
              )}
            </button>
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-[3px] border border-ink-950/15 text-ink-800 transition hover:bg-ink-950/[0.04] lg:hidden"
              aria-label="Abrir menú"
              aria-expanded={drawerOpen}
              aria-controls="mobile-navigation"
              onClick={openMobile}
            >
              <Icon name="menu" className="size-5" />
            </button>
          </div>
        </div>
      </header>

      {logoutError ? (
        <div className="mx-auto w-full max-w-[90rem] px-5 pt-4 sm:px-8 lg:px-10">
          <Alert tone="error" className="text-xs">
            {logoutError}
          </Alert>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-[90rem] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        {children}
      </main>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Navegación principal"
            className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] animate-[fade-up_220ms_ease-out_both] flex-col border-r-2 border-ink-950 bg-paper-50"
          >
            <div className="flex items-center justify-between border-b border-ink-950/15 p-5">
              <BrandMark />
              <button
                type="button"
                className="inline-flex size-9 items-center justify-center rounded-[3px] text-ink-600 transition hover:bg-ink-950/[0.06] hover:text-ink-950"
                aria-label="Cerrar menú"
                onClick={() => setMobileOpen(false)}
              >
                <Icon name="close" className="size-5" />
              </button>
            </div>
            {mobileMenu}
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
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        <p className="px-3 pb-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-ink-500">
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
                "group flex items-center gap-3 border-l-2 px-3 py-2.5 text-sm transition",
                active
                  ? "border-electric-400 bg-electric-400/[0.06] font-semibold text-ink-950"
                  : "border-transparent text-ink-600 hover:border-ink-950/20 hover:bg-ink-950/[0.03] hover:text-ink-950",
              )}
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-[3px] border transition",
                  active
                    ? "border-electric-400/25 bg-paper-50 text-electric-500"
                    : "border-transparent text-ink-500 group-hover:text-ink-700",
                )}
              >
                <Icon name={item.icon} className="size-4" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-950/15 p-4">
        {logoutError ? (
          <Alert tone="error" className="mb-3 text-xs">
            {logoutError}
          </Alert>
        ) : null}
        <div className="flex items-center gap-3 border border-ink-950/15 bg-paper-100 p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-950 text-xs font-semibold text-paper-50">
            {initials(username || "S")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-900">
              {username || "Sin nombre"}
            </p>
            <p className="truncate text-xs text-ink-500">{email}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-[3px] text-ink-600 transition hover:bg-ink-950/[0.06] hover:text-ink-950 disabled:opacity-50"
          >
            {loggingOut ? (
              <Spinner className="size-3.5" />
            ) : (
              <Icon name="logout" className="size-4" />
            )}
          </button>
        </div>
        <p className="mt-3 text-center font-mono text-[0.58rem] uppercase tracking-[0.18em] text-ink-500/60">
          Synforja · 2026
        </p>
      </div>
    </div>
  );
}
