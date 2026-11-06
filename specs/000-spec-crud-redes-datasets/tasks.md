# Tasks 000 — CRUD de redes neuronales y datasets (F5a)

> Ejecución de `plan.md` contra `spec.md`. Cada tarea termina con sus tests en verde (constitución #4).
> Marca `[x]` al completar; no avances de bloque con tests rojos.

## Bloque A — Fundamentos (todas las entidades)

- [ ] **T1. App `networks`** — crear la app, modelo `Network` (plan §2), migración y registro en `INSTALLED_APPS`/`admin.py`.
      *Hecho si:* `manage.py makemigrations networks` genera la migración y `manage.py check` pasa.
- [ ] **T2. Modelo `Dataset`** — completar app `datasets` con el modelo del plan §2, migración y `admin.py`.
      *Hecho si:* ídem T2 y ambas tablas existen en dev (`migrate` ejecutado).
- [ ] **T3. Schemas Pydantic** — modelos de entrada/salida para red (con validadores RN-1/RN-2/RN-3) y dataset (`DatasetCsvIn`, `DatasetJsonIn`).
      *Hecho si:* unit tests de schemas rechazan todas las ramas negativas de RN-1/RN-2/RN-3.
- [ ] **T4. Generación de semilla** — utilidad: si `seed` ausente, entero aleatorio 64-bit con `secrets`; si presente, se respeta (RN-4).
      *Hecho si:* test de alta sin seed devuelve seed y test con seed fija lo conserva.

## Bloque B — Router de redes (RF-1..RF-8, RF-15..16)

- [ ] **T5. Router `networks`** — `POST/GET/GET {id}/PATCH {id}/DELETE {id}` montado en `/api/networks`, protegido con JWT bearer; filtro por dueño.
      *RF:* RF-1 (201 + draft), RF-2 (detalle completo con seed), RF-3 (listado solo propio, desc), RF-7 (401 sin token).
- [ ] **T6. Validación acumulativa de red** — acumular todas las violaciones (plan §4) y devolver 422 con lista completa.
      *RF:* RF-8 (3 fallos simultáneos → 3 entradas).
- [ ] **T7. Aislamiento y 404 uniforme** — recurso ajeno y recurso inexistente responden idéntico.
      *RF:* RF-6 (mismo código/cuerpo).
- [ ] **T8. Estados** — PATCH sobre `trained` → `draft` (RF-4); SI state `training` → 409 en PATCH/DELETE (RF-15).
      *Hecho si:* unidad de estado cubre ambas transiciones.
- [ ] **T9. Deletes completos** — DELETE network 204 y 404 posterior (RF-5); RF-16 verificado en servidor real reiniciando `runserver` (tarea manual al final del proyecto de F5a).

## Bloque C — Router de datasets (RF-9..RF-14, RF-17)

- [ ] **T10. Subida CSV** — endpoint con `input_cols`; pre-chequeo de límites (RF-12) → parseo → validación estructural → guardar con stats (`total_rows`, `input_cols`, `output_cols`).
      *RF:* RF-9, RF-12 (413/422 y sin persistencia).
- [ ] **T11. Subida JSON** — bloques paralelos `inputs`/`expects`; ídem límites y stats.
      *RF:* RF-10.
- [ ] **T12. Reporte de errores con posición** — fila/columna/motivo por cada violación, máx 100 entradas + `total` real si se trunca.
      *RF:* RF-11 (3 filas mal → 3 entradas), RF-17 (150 violaciones → 100 + total 150).
- [ ] **T13. Listado/detalle/borrado de datasets** — listado propio, detalle con stats y vía para contenido íntegro (RF-13), DELETE 204 + 404 posterior (RF-14), aislamiento RF-6.

## Bloque D — RNF y cierre

- [ ] **T14. Rendimiento** — medir p95: CRUD de red con 100 redes < 200 ms (RNF-1); dataset límite 5 MB/50k filas < 2 s (RNF-2); reporte ≤ 100 + contador (RNF-3).
      *Hecho si:* números impresos en el run y dentro de umbral (documentar el resultado aquí).
- [ ] **T15. Pasada e2e con servidor real** — recorrer CU-1..CU-6 con `curl` como en F0 (register → crear red → subir dataset → listar → editar → borrar), apuntando desviaciones a esta lista si aparecen.
- [ ] **T16. Cierre de fase** — `manage.py check` limpio, suite entera verde, resumen "qué construimos / cómo funciona / cómo se verifica" (§2) y actualizar AGENTS.md §12 (F5a → HECHA) + §14.

## Matriz RF → prueba

| RF | Tarea |
|----|-------|
| 1, 2, 3, 7 | T5 |
| 4 | T8 |
| 5 | T9 |
| 6 | T7, T13 |
| 8 | T6 |
| 9, 12 | T10 |
| 10 | T11 |
| 11 | T12 |
| 13, 14 | T13 |
| 15 | T8 |
| 16 | T9 (+T15 manual) |
| 17 | T12 |
