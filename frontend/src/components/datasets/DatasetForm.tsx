"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { ViolationTable } from "@/components/datasets/ViolationTable";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { createDataset } from "@/lib/api/datasets";
import { parseCsvPreview } from "@/lib/datasets/preview";
import { formatBytes, formatNumber } from "@/lib/format";
import type {
  DatasetInput,
  DatasetViolation,
  JsonDatasetContent,
} from "@/lib/types/api";

const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

type InputMode = "file" | "text";
type SourceType = "csv" | "json";

function withoutKey(
  errors: Record<string, string>,
  key: string,
): Record<string, string> {
  const next = { ...errors };
  delete next[key];
  return next;
}

export function DatasetForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("csv");
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [inputCols, setInputCols] = useState("1");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [violations, setViolations] = useState<DatasetViolation[] | null>(null);
  const [violationTotal, setViolationTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const csvColumns = useMemo(() => {
    if (sourceType !== "csv" || !content) {
      return null;
    }
    try {
      const preview = parseCsvPreview(content, 1);
      return preview.rows[0]?.length ?? null;
    } catch {
      return null;
    }
  }, [content, sourceType]);

  const inputColsHint =
    csvColumns && csvColumns > 1
      ? `El CSV tiene ${formatNumber(csvColumns)} columnas. Debe quedar al menos una columna de salida.`
      : "Las primeras columnas serán entradas; el resto, salidas esperadas.";

  const contentBytes = useMemo(() => {
    if (!content) {
      return 0;
    }
    return new Blob([content]).size;
  }, [content]);

  function resetContent() {
    setContent("");
    setFileName(null);
    setFileSize(null);
    setViolations(null);
    setViolationTotal(0);
    setFieldErrors((current) => withoutKey(current, "content"));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function changeSourceType(next: SourceType) {
    if (next === sourceType) {
      return;
    }
    setSourceType(next);
    setInputCols(next === "csv" ? "1" : "");
    resetContent();
    setSubmitError(null);
  }

  function changeInputMode(next: InputMode) {
    if (next === inputMode) {
      return;
    }
    setInputMode(next);
    resetContent();
    setSubmitError(null);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setSubmitError(null);
    setViolations(null);
    setFieldErrors((current) => withoutKey(current, "content"));

    if (file.size > MAX_CONTENT_BYTES) {
      event.target.value = "";
      setFileName(null);
      setFileSize(null);
      setContent("");
      setSubmitError("El archivo supera el límite de 5 MB.");
      return;
    }

    setReadingFile(true);
    try {
      const text = await file.text();
      setContent(text);
      setFileName(file.name);
      setFileSize(file.size);
    } catch {
      setSubmitError("No se pudo leer el archivo seleccionado.");
      setFileName(null);
      setFileSize(null);
      setContent("");
    } finally {
      setReadingFile(false);
    }
  }

  function validate(): DatasetInput | null {
    const errors: Record<string, string> = {};
    const trimmedName = name.trim();
    if (!trimmedName) {
      errors.name = "Escribe un nombre para el dataset.";
    }

    if (!content.trim()) {
      errors.content =
        inputMode === "file"
          ? "Selecciona un archivo con contenido."
          : "Pega el contenido del dataset.";
    } else if (contentBytes > MAX_CONTENT_BYTES) {
      errors.content = "El contenido supera el límite de 5 MB.";
    }

    let parsedInputCols: number | undefined;
    if (sourceType === "csv") {
      const value = Number(inputCols);
      if (
        inputCols.trim() === "" ||
        !Number.isInteger(value) ||
        value < 1
      ) {
        errors.input_cols = "Usa un entero mayor o igual que 1.";
      } else {
        parsedInputCols = value;
      }
    }

    let payloadContent: string | JsonDatasetContent = content;
    if (sourceType === "json" && content.trim()) {
      try {
        const normalized = content.replace(/^\uFEFF/, "");
        const parsed: unknown = JSON.parse(normalized);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          errors.content = "El JSON debe ser un objeto con inputs y expects.";
        } else {
          payloadContent = parsed as JsonDatasetContent;
        }
      } catch (parseError) {
        errors.content =
          parseError instanceof Error
            ? `JSON inválido: ${parseError.message}`
            : "El contenido no es un JSON válido.";
      }
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return null;
    }

    const input: DatasetInput = {
      name: trimmedName,
      source_type: sourceType,
      content: payloadContent,
    };
    if (parsedInputCols !== undefined) {
      input.input_cols = parsedInputCols;
    }
    return input;
  }

  async function create(input: DatasetInput) {
    setSubmitting(true);
    setSubmitError(null);
    setViolations(null);
    setViolationTotal(0);
    try {
      const created = await createDataset(input);
      router.replace(`/datasets/${created.id}`);
      router.refresh();
    } catch (requestError) {
      if (
        requestError instanceof ApiError &&
        requestError.violations &&
        requestError.violations.length > 0
      ) {
        setViolations(requestError.violations);
        setViolationTotal(requestError.total ?? requestError.violations.length);
        setSubmitError(requestError.detail);
      } else {
        setSubmitError(errorMessage(requestError));
      }
      if (requestError instanceof ApiError && requestError.fields) {
        setFieldErrors((current) => ({ ...current, ...requestError.fields }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || readingFile) {
      return;
    }
    const input = validate();
    if (!input) {
      return;
    }
    void create(input);
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Datasets · nuevo"
        title="Nuevo dataset"
        description="Carga un CSV tabular o un JSON estructurado. Revisamos estructura, tamaño y valores antes de guardarlo."
        actions={
          <Link
            href="/datasets"
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            Cancelar
          </Link>
        }
      />

      {submitError ? (
        <Alert
          tone="error"
          title={
            violations && violations.length > 0
              ? "El dataset fue rechazado"
              : "No se pudo crear el dataset"
          }
        >
          {submitError}
        </Alert>
      ) : null}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] xl:items-start"
      >
        <div className="space-y-6">
          <section className="surface rounded-[3px] p-5 sm:p-6">
            <h2 className="font-serif text-lg font-normal text-ink-950">
              Origen de datos
            </h2>
            <p className="mt-1 text-xs leading-5 text-ink-600">
              Leemos el archivo y validamos su contenido antes de guardarlo.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                id="dataset-name"
                name="name"
                label="Nombre"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setFieldErrors((current) => withoutKey(current, "name"));
                }}
                error={fieldErrors.name}
                placeholder="Datos XOR"
                maxLength={100}
                autoComplete="off"
              />
              <Select
                id="dataset-source-type"
                name="source_type"
                label="Formato"
                value={sourceType}
                onChange={(event) =>
                  changeSourceType(event.target.value as SourceType)
                }
              >
                <option value="csv">CSV · tabular</option>
                <option value="json">JSON · estructurado</option>
              </Select>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink-900">Contenido</p>
                <div className="inline-flex rounded-[3px] border border-ink-950/15 bg-paper-50 p-1">
                  <button
                    type="button"
                    aria-pressed={inputMode === "file"}
                    onClick={() => changeInputMode("file")}
                    className={
                      inputMode === "file"
                        ? "rounded-[2px] bg-electric-400 px-3 py-1.5 text-xs font-medium text-paper-100"
                        : "rounded-[2px] px-3 py-1.5 text-xs text-ink-600 transition hover:text-ink-900"
                    }
                  >
                    Archivo
                  </button>
                  <button
                    type="button"
                    aria-pressed={inputMode === "text"}
                    onClick={() => changeInputMode("text")}
                    className={
                      inputMode === "text"
                        ? "rounded-[2px] bg-electric-400 px-3 py-1.5 text-xs font-medium text-paper-100"
                        : "rounded-[2px] px-3 py-1.5 text-xs text-ink-600 transition hover:text-ink-900"
                    }
                  >
                    Pegar texto
                  </button>
                </div>
              </div>

              {inputMode === "file" ? (
                <div>
                  <input
                    ref={fileInputRef}
                    id="dataset-file"
                    name="file"
                    type="file"
                    accept={sourceType === "csv" ? ".csv,text/csv" : ".json,application/json"}
                    onChange={(event) => void handleFile(event)}
                    className="sr-only"
                  />
                  {fileName ? (
                    <div className="flex items-center gap-3 rounded-[3px] border border-electric-400/20 bg-electric-400/[0.045] p-4">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-[3px] border border-electric-400/20 bg-electric-400/[0.08] text-electric-500">
                        <Icon name="file" className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-950">
                          {fileName}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {fileStatusLabel(readingFile, fileSize, contentBytes)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={resetContent}
                      >
                        Quitar
                      </Button>
                    </div>
                  ) : (
                    <label
                      htmlFor="dataset-file"
                      className="flex cursor-pointer flex-col items-center justify-center rounded-[3px] border border-dashed border-ink-950/20 bg-paper-50 px-6 py-10 text-center transition hover:border-electric-400/40 hover:bg-electric-400/[0.03] focus-within:border-electric-400/50 focus-within:ring-2 focus-within:ring-electric-400/15"
                    >
                      <span className="flex size-11 items-center justify-center rounded-[3px] border border-electric-400/20 bg-electric-400/[0.07] text-electric-500">
                        <Icon name="upload" className="size-5" />
                      </span>
                      <span className="mt-3 text-sm font-medium text-ink-900">
                        Seleccionar archivo {sourceType.toUpperCase()}
                      </span>
                      <span className="mt-1 text-xs text-ink-500">
                        Hasta 5 MB · el contenido se valida al enviarlo
                      </span>
                    </label>
                  )}
                  {fieldErrors.content ? (
                    <p className="mt-2 text-xs text-vermilion-400">
                      {fieldErrors.content}
                    </p>
                  ) : null}
                </div>
              ) : (
                <Textarea
                  id="dataset-content"
                  name="content"
                  label="Contenido pegado"
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value);
                    setViolations(null);
                    setViolationTotal(0);
                    setSubmitError(null);
                    setFieldErrors((current) => withoutKey(current, "content"));
                  }}
                  error={fieldErrors.content}
                  placeholder={
                    sourceType === "csv"
                      ? "0,0,0\n0,1,1\n1,0,1\n1,1,0"
                      : '{"inputs": [[0, 0], [0, 1], [1, 0], [1, 1]], "expects": [[0], [1], [1], [0]]}'
                  }
                  hint={`${formatBytes(contentBytes)} de 5 MB máximo.`}
                  spellCheck={false}
                />
              )}
            </div>

            {sourceType === "csv" ? (
              <div className="mt-5 max-w-xs">
                <Field
                  id="dataset-input-cols"
                  name="input_cols"
                  label="Columnas de entrada"
                  type="number"
                  min={1}
                  step={1}
                  value={inputCols}
                  onChange={(event) => {
                    setInputCols(event.target.value);
                    setViolations(null);
                    setViolationTotal(0);
                    setSubmitError(null);
                    setFieldErrors((current) => withoutKey(current, "input_cols"));
                  }}
                  error={fieldErrors.input_cols}
                  hint={inputColsHint}
                  inputMode="numeric"
                />
              </div>
            ) : null}
          </section>

          {violations && violations.length > 0 ? (
            <section className="surface rounded-[3px] p-5 sm:p-6">
              <div className="mb-4">
                <h2 className="font-serif text-lg font-normal text-ink-950">
                  Reporte de violaciones
                </h2>
                <p className="mt-1 text-xs leading-5 text-ink-600">
                  Corrige estas entradas y vuelve a enviar el dataset. No se guardó
                  ningún dato.
                </p>
              </div>
              <ViolationTable
                violations={violations}
                total={violationTotal}
              />
            </section>
          ) : null}
        </div>

        <aside className="space-y-6 xl:sticky xl:top-24">
          <section className="surface rounded-[3px] p-5 sm:p-6">
            <h2 className="font-serif text-lg font-normal text-ink-950">
              Formato esperado
            </h2>
            {sourceType === "csv" ? (
              <div className="mt-4 space-y-3 text-xs leading-5 text-ink-600">
                <p>
                  CSV sin cabecera. Cada fila debe tener el mismo número de
                  columnas y todos los valores deben ser números finitos.
                </p>
                <p>
                  Las primeras <span className="font-mono text-ink-800">N</span>{" "}
                  columnas son entradas y el resto salidas esperadas.{" "}
                  <span className="font-mono text-ink-800">input_cols</span>{" "}
                  indica cuántas son de entrada.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-xs leading-5 text-ink-600">
                <p>
                  JSON con exactamente dos colecciones:{" "}
                  <span className="font-mono text-ink-800">inputs</span> y{" "}
                  <span className="font-mono text-ink-800">expects</span>.
                </p>
                <p>
                  Cada una contiene vectores numéricos. Deben tener el mismo
                  número de filas y no pueden estar vacías.
                </p>
              </div>
            )}
            <div className="mt-4 rounded-[3px] border border-ink-950/15 bg-paper-50 p-3 font-mono text-[0.65rem] leading-5 text-ink-500">
              {sourceType === "csv"
                ? "1,0,1\n0,1,1\n1,1,0"
                : '{\n  "inputs": [[1, 0]],\n  "expects": [[1]]\n}'}
            </div>
          </section>

          <section className="rounded-[3px] border border-electric-400/15 bg-electric-400/[0.045] p-5 sm:p-6">
            <p className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-electric-500">
              Resumen
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-600">Formato</dt>
                <dd className="font-mono uppercase text-ink-900">{sourceType}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-600">Origen</dt>
                <dd className="text-ink-900">
                  {inputMode === "file" ? "Archivo" : "Texto pegado"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-600">Tamaño</dt>
                <dd className="font-mono text-ink-900">
                  {formatBytes(contentBytes)}
                </dd>
              </div>
              {sourceType === "csv" ? (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-600">Entradas</dt>
                  <dd className="font-mono text-ink-900">{inputCols || "—"}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Link
              href="/datasets"
              className={buttonStyles({
                variant: "secondary",
                className: "w-full sm:w-auto",
              })}
            >
              Cancelar
            </Link>
            <Button
              type="submit"
              loading={submitting}
              disabled={readingFile}
              className="w-full sm:w-auto"
              icon={<Icon name="check" className="size-4" />}
            >
              Crear dataset
            </Button>
          </div>
        </aside>
      </form>
    </div>
  );
}

function fileStatusLabel(
  readingFile: boolean,
  fileSize: number | null,
  contentBytes: number,
): string {
  if (readingFile) {
    return "Leyendo archivo…";
  }
  return fileSize === null
    ? formatBytes(contentBytes)
    : `${formatBytes(fileSize)} · listo para enviar`;
}
