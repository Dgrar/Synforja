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

const MIN_PASSWORD_LENGTH = 8;

export function RegisterForm() {
  const { register, csrfReady, error: sessionError } = useSession();
  const router = useRouter();
  const loginHref = useAuthSwitch("/login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const nextFieldErrors: Record<string, string> = {};
    if (!username.trim()) {
      nextFieldErrors.username = "Elige un nombre de usuario.";
    }
    if (!email.trim()) {
      nextFieldErrors.email = "Escribe tu correo.";
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      nextFieldErrors.password = `Usa al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }
    if (password !== confirmation) {
      nextFieldErrors.confirmation = "Las contraseñas no coinciden.";
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
      await register({
        username: username.trim(),
        email: email.trim(),
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

  function clearField(field: string) {
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  }

  return (
    <section>
      <AuthIntro
        eyebrow="Nueva cuenta"
        title="Empieza a construir"
        description="Crea tu espacio para diseñar redes, preparar datos y observar cada época del entrenamiento."
      />

      {error ? (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Field
          label="Nombre de usuario"
          name="username"
          type="text"
          autoComplete="username"
          placeholder="Tu nombre"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            clearField("username");
          }}
          error={fieldErrors.username}
          disabled={submitting}
          autoFocus
        />

        <Field
          label="Correo"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            clearField("email");
          }}
          error={fieldErrors.email}
          disabled={submitting}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Contraseña"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearField("password");
            }}
            error={fieldErrors.password}
            disabled={submitting}
          />

          <Field
            label="Confirmar contraseña"
            name="password_confirmation"
            type="password"
            autoComplete="new-password"
            placeholder="Repite la contraseña"
            value={confirmation}
            onChange={(event) => {
              setConfirmation(event.target.value);
              clearField("confirmation");
            }}
            error={fieldErrors.confirmation}
            disabled={submitting}
          />
        </div>

        <Button type="submit" loading={submitting} className="w-full">
          Crear mi cuenta
        </Button>
      </form>

      <p className="mt-6 flex items-center gap-2 text-xs leading-5 text-mist-500">
        <Icon name="lock" className="size-3.5 shrink-0 text-mint-400/80" />
        La contraseña viaja solo a la API. La sesión se mantiene en cookies
        HttpOnly.
      </p>

      <p className="mt-7 text-sm text-mist-400">
        ¿Ya tienes cuenta?{" "}
        <Link
          href={loginHref}
          className="font-medium text-mint-300 transition hover:text-mint-200"
        >
          Iniciar sesión
        </Link>
      </p>
    </section>
  );
}
