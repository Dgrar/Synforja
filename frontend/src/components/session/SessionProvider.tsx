"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  fetchMe,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from "@/lib/api/auth";
import { errorMessage, isSessionExpired } from "@/lib/api/errors";
import { resolveSession } from "@/lib/session/bootstrap";
import { fetchCsrfToken, resetCsrfToken } from "@/lib/session/csrf";
import { onSessionExpired } from "@/lib/session/events";
import { refreshSession } from "@/lib/session/refresh";
import type { LoginInput, RegisterInput, User } from "@/lib/types/api";

export type SessionStatus = "loading" | "authenticated" | "anonymous";

interface SessionContextValue {
  status: SessionStatus;
  user: User | null;
  error: string | null;
  csrfReady: boolean;
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const SESSION_EXPIRED_MESSAGE =
  "Tu sesión ha caducado. Inicia sesión de nuevo para continuar.";
const COOKIE_CONFIRMATION_ERROR =
  "No se pudo confirmar la sesión. Revisa que el navegador acepte las cookies de este sitio.";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csrfReady, setCsrfReady] = useState(false);
  const started = useRef(false);

  const bootstrap = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      await fetchCsrfToken(true);
      setCsrfReady(true);
    } catch (bootstrapError) {
      setCsrfReady(false);
      setStatus("anonymous");
      setError(
        `No se pudo preparar la conexión segura. ${errorMessage(bootstrapError)}`,
      );
      return;
    }

    try {
      const result = await resolveSession({
        getMe: fetchMe,
        refresh: refreshSession,
      });

      if (result.status === "authenticated") {
        setUser(result.user);
        setStatus("authenticated");
        setError(null);
        return;
      }

      setUser(null);
      setStatus("anonymous");
      setError(null);
    } catch (bootstrapError) {
      setUser(null);
      setStatus("anonymous");
      setError(errorMessage(bootstrapError));
    }
  }, []);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    void bootstrap();
  }, [bootstrap]);

  useEffect(
    () =>
      onSessionExpired(() => {
        setUser(null);
        setStatus("anonymous");
        setError(SESSION_EXPIRED_MESSAGE);
      }),
    [],
  );

  const completeAuthentication = useCallback(async () => {
    try {
      const confirmed = await fetchMe();
      setUser(confirmed);
      setStatus("authenticated");
      setError(null);
      return confirmed;
    } catch (confirmationError) {
      setUser(null);
      setStatus("anonymous");
      if (isSessionExpired(confirmationError)) {
        throw new Error(COOKIE_CONFIRMATION_ERROR);
      }
      throw confirmationError;
    }
  }, []);

  const login = useCallback(
    async (input: LoginInput) => {
      await loginRequest(input);
      return completeAuthentication();
    },
    [completeAuthentication],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      await registerRequest(input);
      return completeAuthentication();
    },
    [completeAuthentication],
  );

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setStatus("anonymous");
    setError(null);
    resetCsrfToken();

    try {
      await fetchCsrfToken(true);
      setCsrfReady(true);
    } catch {
      setCsrfReady(false);
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      error,
      csrfReady,
      login,
      register,
      logout,
      retryBootstrap: bootstrap,
    }),
    [bootstrap, csrfReady, error, login, logout, register, status, user],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession debe usarse dentro de SessionProvider.");
  }
  return context;
}
