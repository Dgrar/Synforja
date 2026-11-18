"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { TopologyPreview } from "@/components/networks/TopologyPreview";
import { StateBadge } from "@/components/app/StateBadge";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonStyles } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { createNetwork, updateNetwork } from "@/lib/api/networks";
import { formatNumber } from "@/lib/format";
import type {
  Activation,
  Layer,
  Loss,
  Network,
  NetworkInput,
} from "@/lib/types/api";

interface LayerDraft {
  size: string;
  activation: Activation;
}

const DEFAULT_LAYERS: LayerDraft[] = [
  { size: "2", activation: "relu" },
  { size: "4", activation: "relu" },
  { size: "1", activation: "sigmoid" },
];

const ACTIVATIONS: { value: Activation; label: string }[] = [
  { value: "relu", label: "ReLU" },
  { value: "sigmoid", label: "Sigmoide" },
  { value: "tanh", label: "Tanh" },
  { value: "softmax", label: "Softmax" },
  { value: "linear", label: "Lineal" },
];

const LOSSES: { value: Loss; label: string }[] = [
  { value: "mse", label: "MSE · error cuadrático medio" },
  { value: "bce", label: "BCE · entropía cruzada binaria" },
  { value: "mae", label: "MAE · error absoluto medio" },
];

const MAX_SEED = Number.MAX_SAFE_INTEGER;

function layersFromNetwork(network: Network): LayerDraft[] {
  return network.layers.map((layer) => ({
    size: String(layer.size),
    activation: layer.activation,
  }));
}

function clearLayerErrors(
  errors: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(errors).filter(([key]) => !key.startsWith("layers")),
  );
}

function withoutKey(
  errors: Record<string, string>,
  key: string,
): Record<string, string> {
  if (!(key in errors)) {
    return errors;
  }
  const next = { ...errors };
  delete next[key];
  return next;
}

function parseSeed(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_SEED ? parsed : null;
}

export function NetworkForm({
  network,
}: {
  network?: Network;
}) {
  const router = useRouter();
  const editing = Boolean(network);
  const locked = network?.state === "training";
  const initialSeed = network ? String(network.seed) : "";

  const [name, setName] = useState(network?.name ?? "");
  const [layers, setLayers] = useState<LayerDraft[]>(() =>
    network ? layersFromNetwork(network) : DEFAULT_LAYERS,
  );
  const [epochs, setEpochs] = useState(String(network?.epochs ?? 100));
  const [learningRate, setLearningRate] = useState(
    String(network?.learning_rate ?? 0.1),
  );
  const [loss, setLoss] = useState<Loss>(network?.loss ?? "mse");
  const [trainingSplit, setTrainingSplit] = useState(
    String(network?.training_split ?? 0.8),
  );
  const [seed, setSeed] = useState(initialSeed);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingInput, setPendingInput] = useState<NetworkInput | null>(null);

  const previewLayers: Layer[] = layers.map((layer) => ({
    size: Number.isFinite(Number(layer.size)) ? Math.max(0, Number(layer.size)) : 0,
    activation: layer.activation,
  }));
  const totalNeurons = previewLayers.reduce((total, layer) => total + layer.size, 0);

  function updateLayer(index: number, patch: Partial<LayerDraft>) {
    setLayers((current) =>
      current.map((layer, layerIndex) =>
        layerIndex === index ? { ...layer, ...patch } : layer,
      ),
    );
  }

  function addLayer() {
    if (layers.length >= 20) {
      return;
    }
    setLayers((current) => [
      ...current,
      { size: "4", activation: "relu" },
    ]);
    setFieldErrors((current) => clearLayerErrors(current));
  }

  function removeLayer(index: number) {
    if (layers.length <= 2) {
      return;
    }
    setLayers((current) => current.filter((_, layerIndex) => layerIndex !== index));
    setFieldErrors((current) => clearLayerErrors(current));
  }

  function moveLayer(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= layers.length) {
      return;
    }
    setLayers((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setFieldErrors((current) => clearLayerErrors(current));
  }

  function validate(): NetworkInput | null {
    const errors: Record<string, string> = {};
    const trimmedName = name.trim();
    if (!trimmedName) {
      errors.name = "Escribe un nombre para la red.";
    }

    if (layers.length < 2) {
      errors.layers = "La red necesita al menos dos capas.";
    } else if (layers.length > 20) {
      errors.layers = "La red admite como máximo 20 capas.";
    }

    const parsedLayers: Layer[] = layers.map((layer, index) => {
      const size = Number(layer.size);
      if (
        layer.size.trim() === "" ||
        !Number.isInteger(size) ||
        size < 1 ||
        size > 2048
      ) {
        errors[`layers.${index}.size`] = "Usa un entero entre 1 y 2048.";
      }
      return { size, activation: layer.activation };
    });

    const parsedEpochs = Number(epochs);
    if (
      epochs.trim() === "" ||
      !Number.isInteger(parsedEpochs) ||
      parsedEpochs < 1 ||
      parsedEpochs > 10000
    ) {
      errors.epochs = "Usa un entero entre 1 y 10 000.";
    }

    const parsedLearningRate = Number(learningRate);
    if (
      learningRate.trim() === "" ||
      !Number.isFinite(parsedLearningRate) ||
      parsedLearningRate <= 0 ||
      parsedLearningRate > 1
    ) {
      errors.learning_rate = "Usa un valor mayor que 0 y hasta 1.";
    }

    const parsedSplit = Number(trainingSplit);
    if (
      trainingSplit.trim() === "" ||
      !Number.isFinite(parsedSplit) ||
      parsedSplit <= 0 ||
      parsedSplit >= 1
    ) {
      errors.training_split = "Usa un valor mayor que 0 y menor que 1.";
    }

    const trimmedSeed = seed.trim();
    let seedValue: number | undefined;
    if (editing) {
      if (!trimmedSeed) {
        errors.seed = "La semilla no puede quedar vacía.";
      } else if (trimmedSeed !== initialSeed) {
        const parsed = parseSeed(trimmedSeed);
        if (parsed === null) {
          errors.seed = "Usa un entero entre 0 y 9 007 199 254 740 991.";
        } else {
          seedValue = parsed;
        }
      }
    } else if (trimmedSeed) {
      const parsed = parseSeed(trimmedSeed);
      if (parsed === null) {
        errors.seed = "Usa un entero entre 0 y 9 007 199 254 740 991.";
      } else {
        seedValue = parsed;
      }
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return null;
    }

    const input: NetworkInput = {
      name: trimmedName,
      layers: parsedLayers,
      epochs: parsedEpochs,
      learning_rate: parsedLearningRate,
      loss,
      training_split: parsedSplit,
    };
    if (seedValue !== undefined) {
      input.seed = seedValue;
    }
    return input;
  }

  function applyRequestError(requestError: unknown) {
    setSubmitError(errorMessage(requestError));
    if (requestError instanceof ApiError && requestError.fields) {
      setFieldErrors((current) => ({ ...current, ...requestError.fields }));
    }
  }

  async function save(input: NetworkInput) {
    setSaving(true);
    setSubmitError(null);
    try {
      if (network) {
        const updated = await updateNetwork(network.id, input);
        router.replace(`/networks/${updated.id}`);
      } else {
        const created = await createNetwork(input);
        router.replace(`/networks/${created.id}`);
      }
      router.refresh();
    } catch (requestError) {
      applyRequestError(requestError);
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || locked) {
      return;
    }
    const input = validate();
    if (!input) {
      return;
    }
    if (network?.state === "trained") {
      setPendingInput(input);
      setConfirmOpen(true);
      return;
    }
    void save(input);
  }

  function confirmTrainedSave() {
    if (!pendingInput) {
      return;
    }
    setConfirmOpen(false);
    const input = pendingInput;
    setPendingInput(null);
    void save(input);
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={network ? "Redes · edición" : "Redes · nueva"}
        title={network ? `Editar ${network.name}` : "Nueva red"}
        description={
          network
            ? "Ajusta la topología y los hiperparámetros. Los cambios sobre una red entrenada invalidan sus pesos."
            : "Define capas, neuronas e hiperparámetros. La API validará la red antes de guardarla."
        }
        actions={
          <Link
            href={network ? `/networks/${network.id}` : "/networks"}
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            Cancelar
          </Link>
        }
      />

      {network ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-mist-400">
          <StateBadge state={network.state} />
          <span>Guardada con id {network.id}</span>
        </div>
      ) : null}

      {locked ? (
        <Alert tone="warning" title="La red está entrenando">
          No puedes guardar cambios mientras hay un entrenamiento en curso.
          Espera a que termine o cancélalo desde el entrenamiento.
        </Alert>
      ) : null}

      {submitError ? (
        <Alert tone="error" title="No se pudo guardar la red">
          {submitError}
        </Alert>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] xl:items-start"
      >
        <div className="space-y-6">
          <section className="surface rounded-2xl p-5 sm:p-6">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-mist-50">
                Identidad y topología
              </h2>
              <p className="mt-1 text-xs leading-5 text-mist-400">
                La primera capa recibe las entradas y la última produce la salida.
                Las capas intermedias son ocultas.
              </p>
            </div>

            <Field
              id="network-name"
              name="name"
              label="Nombre"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setFieldErrors((current) => withoutKey(current, "name"));
              }}
              error={fieldErrors.name}
              placeholder="XOR básico"
              maxLength={120}
              autoComplete="off"
            />

            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-mist-100">Capas</h3>
                  <p className="mt-0.5 text-xs text-mist-500">
                    Entre 2 y 20 capas. Máximo 2 048 neuronas por capa.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addLayer}
                  disabled={layers.length >= 20}
                  icon={<Icon name="plus" className="size-3.5" />}
                >
                  Añadir capa
                </Button>
              </div>

              {fieldErrors.layers ? (
                <p className="mb-3 text-xs text-coral-400">{fieldErrors.layers}</p>
              ) : null}

              <div className="space-y-3">
                {layers.map((layer, index) => {
                  const role =
                    index === 0
                      ? "entrada"
                      : index === layers.length - 1
                        ? "salida"
                        : `oculta ${index}`;
                  return (
                    <div
                      key={index}
                      className="rounded-xl border border-white/[0.08] bg-ink-950/35 p-3.5"
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-mist-300">
                          Capa {index + 1}{" "}
                          <span className="font-normal text-mist-500">
                            · {role}
                          </span>
                        </p>
                        <div className="flex items-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Subir capa ${index + 1}`}
                            title="Subir"
                            onClick={() => moveLayer(index, -1)}
                            disabled={index === 0}
                            icon={<Icon name="arrow-up" className="size-3.5" />}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Bajar capa ${index + 1}`}
                            title="Bajar"
                            onClick={() => moveLayer(index, 1)}
                            disabled={index === layers.length - 1}
                            icon={<Icon name="arrow-down" className="size-3.5" />}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Quitar capa ${index + 1}`}
                            title="Quitar"
                            onClick={() => removeLayer(index)}
                            disabled={layers.length <= 2}
                            icon={<Icon name="trash" className="size-3.5" />}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Field
                          id={`layer-${index}-size`}
                          name={`layers.${index}.size`}
                          label="Neuronas"
                          type="number"
                          min={1}
                          max={2048}
                          step={1}
                          value={layer.size}
                          onChange={(event) => {
                            updateLayer(index, { size: event.target.value });
                            setFieldErrors((current) =>
                              withoutKey(current, `layers.${index}.size`),
                            );
                          }}
                          error={fieldErrors[`layers.${index}.size`]}
                          inputMode="numeric"
                        />
                        <Select
                          id={`layer-${index}-activation`}
                          name={`layers.${index}.activation`}
                          label="Activación"
                          value={layer.activation}
                          onChange={(event) => {
                            updateLayer(index, {
                              activation: event.target.value as Activation,
                            });
                            setFieldErrors((current) =>
                              withoutKey(current, `layers.${index}.activation`),
                            );
                          }}
                          error={fieldErrors[`layers.${index}.activation`]}
                        >
                          {ACTIVATIONS.map((activation) => (
                            <option
                              key={activation.value}
                              value={activation.value}
                            >
                              {activation.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="surface rounded-2xl p-5 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-mist-50">
                  Topología
                </h2>
                <p className="mt-1 text-xs leading-5 text-mist-400">
                  Vista esquemática de la red. No se calculan salidas ni gradientes aquí.
                </p>
              </div>
              <span className="rounded-full border border-white/[0.1] px-2.5 py-1 font-mono text-[0.62rem] text-mist-500">
                {formatNumber(totalNeurons)} neuronas
              </span>
            </div>
            <TopologyPreview layers={previewLayers} />
          </section>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-24">
          <section className="surface rounded-2xl p-5 sm:p-6">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-mist-50">
                Entrenamiento
              </h2>
              <p className="mt-1 text-xs leading-5 text-mist-400">
                Estos valores se guardan con la red y definen cómo se entrenará.
              </p>
            </div>

            <div className="space-y-4">
              <Field
                id="network-epochs"
                name="epochs"
                label="Épocas"
                type="number"
                min={1}
                max={10000}
                step={1}
                value={epochs}
                onChange={(event) => {
                  setEpochs(event.target.value);
                  setFieldErrors((current) => withoutKey(current, "epochs"));
                }}
                error={fieldErrors.epochs}
                hint="Una época es una pasada completa por los datos de entrenamiento."
                inputMode="numeric"
              />

              <Field
                id="network-learning-rate"
                name="learning_rate"
                label="Learning rate"
                type="number"
                min={0.000001}
                max={1}
                step="any"
                value={learningRate}
                onChange={(event) => {
                  setLearningRate(event.target.value);
                  setFieldErrors((current) =>
                    withoutKey(current, "learning_rate"),
                  );
                }}
                error={fieldErrors.learning_rate}
                hint="Tamaño del paso al actualizar los pesos."
                inputMode="decimal"
              />

              <Select
                id="network-loss"
                name="loss"
                label="Función de pérdida"
                value={loss}
                onChange={(event) => {
                  setLoss(event.target.value as Loss);
                }}
                error={fieldErrors.loss}
              >
                {LOSSES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>

              <Field
                id="network-training-split"
                name="training_split"
                label="Proporción de entrenamiento"
                type="number"
                min={0.01}
                max={0.99}
                step={0.01}
                value={trainingSplit}
                onChange={(event) => {
                  setTrainingSplit(event.target.value);
                  setFieldErrors((current) =>
                    withoutKey(current, "training_split"),
                  );
                }}
                error={fieldErrors.training_split}
                hint="0.8 = 80 % entrenamiento y 20 % prueba."
                inputMode="decimal"
              />

              <Field
                id="network-seed"
                name="seed"
                label="Semilla"
                value={seed}
                onChange={(event) => {
                  setSeed(event.target.value);
                  setFieldErrors((current) => withoutKey(current, "seed"));
                }}
                error={fieldErrors.seed}
                hint={
                  editing
                    ? "Se conserva si no la modificas. Si la cambias, usa un entero seguro."
                    : "Vacía para que la API genere una semilla; si la escribes, debe ser un entero seguro."
                }
                inputMode="numeric"
                autoComplete="off"
                maxLength={19}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-mint-400/15 bg-mint-400/[0.045] p-5 sm:p-6">
            <p className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-mint-300/80">
              Resumen
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">Capas</dt>
                <dd className="font-mono text-mist-100">
                  {formatNumber(layers.length)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">Neuronas</dt>
                <dd className="font-mono text-mist-100">
                  {formatNumber(totalNeurons)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">Épocas</dt>
                <dd className="font-mono text-mist-100">{epochs || "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-mist-400">Loss</dt>
                <dd className="font-mono uppercase text-mist-100">{loss}</dd>
              </div>
            </dl>
          </section>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Link
              href={network ? `/networks/${network.id}` : "/networks"}
              className={buttonStyles({
                variant: "secondary",
                className: "w-full sm:w-auto",
              })}
            >
              Cancelar
            </Link>
            <Button
              type="submit"
              loading={saving}
              disabled={locked}
              className="w-full sm:w-auto"
              icon={<Icon name="check" className="size-4" />}
            >
              {network ? "Guardar cambios" : "Crear red"}
            </Button>
          </div>
        </aside>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title="Guardar una red entrenada"
        description="Al guardar estos cambios se borrarán los pesos actuales y la red volverá a borrador. Los runs anteriores se conservan."
        confirmLabel="Guardar y reiniciar"
        busy={saving}
        onConfirm={confirmTrainedSave}
        onCancel={() => {
          setConfirmOpen(false);
          setPendingInput(null);
        }}
      />
    </div>
  );
}
