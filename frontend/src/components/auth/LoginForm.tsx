"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthIntro } from "@/components/auth/AuthIntro";
import { useAuthSwitch } from "@/components/auth/useAuthSwitch";
import { useSession } from "@/components/session/SessionProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { readNextPath } from "@/lib/navigation";

export function LoginForm() {
  const { login, csrfReady, error: sessionError } = useSession();
  const router = useRouter();
  const registerHref = useAuthSwitch("/register");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const nextFieldErrors: Record<string, string> = {};
    if (!identifier.trim()) {
      nextFieldErrors.username_or_email = "Escribe tu usuario o correo.";
    }
    if (!password) {
      nextFieldErrors.password = "Escribe tu contraseña.";
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    if (!csrfReady) {
      setError(
        sessionError ??
          "La conexión segura no está lista. Recarga la página e inténtalo de nuevo.",
      );
      return;
    }

    setSubmitting(true);
    try {
      await login({
        username_or_email: identifier.trim(),
        password,
      });
      router.replace(readNextPath());
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setFieldErrors(submitError.fields ?? {});
      }
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <AuthIntro
        eyebrow="Acceso"
        title="Vuelve a tu laboratorio"
        description="Tus redes y datasets te esperan. La sesión se guarda de forma segura en cookies HttpOnly."
      />

      {error ? (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Field
          label="Usuario o correo"
          name="username_or_email"
          type="text"
          autoComplete="username"
          placeholder="tu@correo.com"
          value={identifier}
          onChange={(event) => {
            setIdentifier(event.target.value);
            setFieldErrors((current) => ({
              ...current,
              username_or_email: "",
            }));
          }}
          error={fieldErrors.username_or_email}
          disabled={submitting}
          autoFocus
        />

        <Field
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Tu contraseña"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setFieldErrors((current) => ({ ...current, password: "" }));
          }}
          error={fieldErrors.password}
          disabled={submitting}
        />

        <Button type="submit" loading={submitting} className="w-full">
          Entrar al laboratorio
        </Button>
      </form>

      <p className="mt-6 flex items-center gap-2 text-xs leading-5 text-mist-500">
        <Icon name="lock" className="size-3.5 shrink-0 text-mint-400/80" />
        No guardamos tokens en el navegador. La API valida cada operación.
      </p>

      <p className="mt-7 text-sm text-mist-400">
        ¿Aún no tienes cuenta?{" "}
        <Link
          href={registerHref}
          className="font-medium text-mint-300 transition hover:text-mint-200"
        >
          Crear una cuenta
        </Link>
      </p>
    </section>
  );
}
