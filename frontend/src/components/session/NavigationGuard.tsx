"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const DEFAULT_MESSAGE =
  "Si sales ahora, la operación en curso se cancelará. ¿Quieres continuar?";

interface NavigationGuardValue {
  active: boolean;
  message: string;
  setActive: (active: boolean, message?: string) => void;
}

const NavigationGuardContext = createContext<NavigationGuardValue | null>(null);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [active, setActiveState] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const router = useRouter();

  const setActive = useCallback((nextActive: boolean, nextMessage?: string) => {
    setActiveState(nextActive);
    setMessage(nextMessage ?? DEFAULT_MESSAGE);
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }

    const marker = { ...(history.state ?? {}), __synforjaGuard: true };
    history.pushState(marker, "", window.location.href);

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };

    const handlePopState = () => {
      if (window.confirm(message)) {
        setActiveState(false);
        return;
      }
      history.go(1);
    };

    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname === window.location.pathname
      ) {
        return;
      }

      event.preventDefault();
      if (window.confirm(message)) {
        setActiveState(false);
        router.push(`${url.pathname}${url.search}${url.hash}`);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleClick, true);
    };
  }, [active, message, router]);

  const value = useMemo(
    () => ({ active, message, setActive }),
    [active, message, setActive],
  );

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard(): NavigationGuardValue {
  const context = useContext(NavigationGuardContext);
  if (!context) {
    throw new Error(
      "useNavigationGuard debe usarse dentro de NavigationGuardProvider.",
    );
  }
  return context;
}
