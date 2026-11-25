"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { QueryError } from "@/components/app/QueryError";
import { StateBadge } from "@/components/app/StateBadge";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { errorMessage } from "@/lib/api/errors";
import { predict } from "@/lib/api/training";
import { formatMetric, formatNumber } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks/useApiQuery";
import { parseVectorInput, vectorTokens } from "@/lib/predict/vector";
import type { Network } from "@/lib/types/api";

function placeholderFor(expected: number): string {
  return Array.from({ length: Math.min(Math.max(expected, 2), 6) }, () => "0").join(
    ", ",
  );
}

export function PredictForm({ id }: { id: number }) {
  const {
    data: network,
    error: networkError,
    loading: networkLoading,
    reload: reloadNetwork,
  } = useApiQuery<Network>(`/networks/${id}`);

  const [input, setInput] = useState("");
  const [result, setResult] = useState<number[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestError(null);
    setResult(null);

    const parsed = parseVectorInput(input);
    if (!parsed.values) {
      setParseError(parsed.error);
      return;
    }

    setParseError(null);
    setSubmitting(true);
    try {
      const response = await predict(id, parsed.values);
      setResult(response.output);
    } catch (predictError) {
      setRequestError(errorMessage(predictError));
    } finally {
      setSubmitting(false);
    }
  }

  if (networkLoading && !network) {
    return (
      <div className="space-y-7">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-9 w-80 max-w-full" />
        <Skeleton className="h-56 rounded-[3px]" />
      </div>
    );
  }

  if (!network) {
    return (
      <div className="space-y-6">
        <QueryError error={networkError} onRetry={reloadNetwork} />
        <Link
          href="/networks"
          className={buttonStyles({ variant: "secondary", size: "sm" })}
        >
          Volver a redes
        </Link>
      </div>
    );
  }

  const expected = network.layers[0]?.size ?? 0;
  const tokenCount = vectorTokens(input).length;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Red · predicción"
        title={`Predecir con ${network.name}`}
        description="Envía un vector a la red entrenada y muestra la salida que devuelve la API, en el mismo orden. La interfaz no calcula salidas."
        actions={
          <>
            <Link
              href={`/networks/${network.id}`}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              Volver
            </Link>
            <StateBadge state={network.state} />
          </>
        }
      />

      {network.state !== "trained" ? (
        <Alert
          tone="warning"
          title="La red no está entrenada"
          actions={
            <Link
              href={`/networks/${network.id}/train`}
              className={buttonStyles({ variant: "secondary", size: "sm" })}
            >
              Entrenar la red
            </Link>
          }
        >
          Sin pesos entrenados no hay predicción. Si envías el vector igualmente,
          la API rechazará la operación y su motivo será el que se muestre.
        </Alert>
      ) : null}

      {requestError ? (
        <Alert tone="error" title="La predicción fue rechazada">
          {requestError}
        </Alert>
      ) : null}

      <section className="surface rounded-[3px] p-5 sm:p-6">
        <h2 className="font-serif text-lg font-normal text-ink-950">
          Vector de entrada
        </h2>
        <p className="mt-1 text-xs leading-5 text-ink-600">
          La primera capa espera {formatNumber(expected)}{" "}
          {expected === 1 ? "valor" : "valores"}. Sepáralos por comas o espacios.
        </p>

        <form
          className="mt-5 space-y-4 sm:max-w-xl"
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
        >
          <Field
            label="Valores de entrada"
            name="input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={placeholderFor(expected)}
            inputMode="decimal"
            spellCheck={false}
            autoComplete="off"
            error={parseError ?? undefined}
            hint={`${formatNumber(tokenCount)} ${
              tokenCount === 1 ? "valor introducido" : "valores introducidos"
            } · ${formatNumber(expected)} esperados`}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={submitting}>
              Predecir
            </Button>
            <p className="text-xs text-ink-600">
              La validación de forma y valores la hace la API.
            </p>
          </div>
        </form>
      </section>

      {result ? (
        <section
          aria-live="polite"
          className="rounded-[3px] border border-electric-400/25 bg-electric-400/[0.05] p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-serif text-lg font-normal text-ink-950">
              Salida
            </h2>
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-ink-500">
              {formatNumber(result.length)}{" "}
              {result.length === 1 ? "valor" : "valores"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-ink-600">
            Vector devuelto por la API, en el orden de las salidas de la red.
          </p>

          <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {result.map((value, index) => (
              <li
                key={index}
                className="rounded-[3px] border border-ink-950/15 bg-paper-50 px-3 py-2"
              >
                <span className="block font-mono text-[0.58rem] uppercase tracking-[0.14em] text-ink-500">
                  Salida {index + 1}
                </span>
                <span className="mt-1 block font-mono text-sm text-ink-950">
                  {formatMetric(value)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/networks/${network.id}`}
          className={buttonStyles({ variant: "ghost", size: "sm" })}
        >
          Volver al detalle
        </Link>
        <Link
          href={`/networks/${network.id}/runs`}
          className={buttonStyles({ variant: "ghost", size: "sm" })}
        >
          Ver corridas
        </Link>
      </div>
    </div>
  );
}
