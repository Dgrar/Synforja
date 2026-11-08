# Tasks 000 — CRUD de redes neuronales y datasets (F5a)

> Ejecución de `plan.md` contra `spec.md`. Cada tarea termina con sus tests en verde (constitución #4).
> Marca `[x]` al completar; no avances de bloque con tests rojos.

## Bloque A — Fundamentos (todas las entidades)

- [x] **T1. App `networks`** — crear la app, modelo `Network` (plan §2), migración y registro en `INSTALLED_APPS`/`admin.py`.
      *Hecho si:* `manage.py makemigrations networks` genera la migración y `manage.py check` pasa.
- [x] **T2. Modelo `Dataset`** — completar app `datasets` con el modelo del plan §2, migración y `admin.py`.
      *Hecho si:* ídem T2 y ambas tablas existen en dev (`migrate` ejecutado).
- [x] **T3. Schemas Pydantic** — modelos de entrada/salida para red (con validadores RN-1/RN-2/RN-3) y dataset (`DatasetCsvIn`, `DatasetJsonIn`).
      *Hecho si:* unit tests de schemas rechazan todas las ramas negativas de RN-1/RN-2/RN-3.
- [x] **T4. Generación de semilla** — utilidad: si `seed` ausente, entero aleatorio 64-bit con `secrets`; si presente, se respeta (RN-4).
      *Hecho si:* test de alta sin seed devuelve seed y test con seed fija lo conserva.

## Bloque B — Router de redes (RF-1..RF-8, RF-15..16)

- [x] **T5. Router `networks`** — `POST/GET/GET {id}/PATCH {id}/DELETE {id}` montado en `/api/networks`, protegido con JWT bearer; filtro por dueño.
      *RF:* RF-1 (201 + draft), RF-2 (detalle completo con seed), RF-3 (listado solo propio, desc), RF-7 (401 sin token).
- [x] **T6. Validación acumulativa de red** — acumular todas las violaciones (plan §4) y devolver 422 con lista completa.
      *RF:* RF-8 (3 fallos simultáneos → 3 entradas).
      > Ampliación 08-11-2026: topes de red RF-18 (adelantados de F5b) implementados aquí: capa ≤ 2048 neuronas (le en `LayerIn.size`), ≤ 20 capas (max_length en `NetworkIn.layers`); PATCH revalidado cubre el mismo tope. Tests: bordes incluidos (2048/20 válidos; 2049/21 → 422).
- [x] **T7. Aislamiento y 404 uniforme** — recurso ajeno y recurso inexistente responden idéntico.
      *RF:* RF-6 (mismo código/cuerpo).
- [x] **T8. Estados** — PATCH sobre `trained` → `draft` (RF-4); SI state `training` → 409 en PATCH/DELETE (RF-15).
      *Hecho si:* unidad de estado cubre ambas transiciones.
- [x] **T9. Deletes completos** — DELETE network 204 y 404 posterior (RF-5); RF-16 verificado en servidor real reiniciando `runserver` (tarea manual al final del proyecto de F5a).
      > Verificación RF-16 hecha el 08-11-2026 en T15 (crear red → matar runserver → arrancar de nuevo → GET 200). Tarea cerrada.

## Bloque C — Router de datasets (RF-9..RF-14, RF-17)

- [x] **T10. Subida CSV** — endpoint con `input_cols`; pre-chequeo de límites (RF-12) → parseo → validación estructural → guardar con stats (`total_rows`, `input_cols`, `output_cols`).
      *RF:* RF-9, RF-12 (413/422 y sin persistencia).
      > 08-11-2026: contrato fijo con `source_type: "csv"` explícito (enmienda II); anchura = primera fila no vacía; fila en blanco media = violación "fila vacía".
- [x] **T11. Subida JSON** — bloques paralelos `inputs`/`expects`; ídem límites y stats.
      *RF:* RF-10.
      > 08-11-2026: sin `input_cols`; claves exactas; bool no es número; desbalance = violación block-level; almacenado compacto.
- [x] **T12. Reporte de errores con posición** — fila/columna/motivo por cada violación, máx 100 entradas + `total` real si se trunca.
      *RF:* RF-11 (3 filas mal → 3 entradas), RF-17 (150 violaciones → 100 + total 150).
      > 08-11-2026: numeración 1-based; cuerpo `{"detail": {"violations": [...], "total": N}}` vía JsonResponse (ninja 1.7.1 no soporta dict en HttpError); lógica pura en `datasets/validation.py` (26 tests unitarios).
- [x] **T13. Listado/detalle/borrado de datasets** — listado propio, detalle con stats y vía para contenido íntegro (RF-13), DELETE 204 + 404 posterior (RF-14), aislamiento RF-6.
      > 08-11-2026: `content_url` en DatasetOut + endpoint `GET {id}/content`; RF-16 (reinicio) queda igualmente para T15 manual.

## Bloque D — RNF y cierre

- [x] **T14. Rendimiento** — medir p95: CRUD de red con 100 redes < 200 ms (RNF-1); dataset límite 5 MB/50k filas < 2 s (RNF-2); reporte ≤ 100 + contador (RNF-3).
      *Hecho si:* números impresos en el run y dentro de umbral (documentar el resultado aquí).
      > Resultados 08-11-2026 (`manage.py test core.perf`, entorno test): RNF-1 con 100 redes — list p95 **39,6 ms**, detail 6,2 ms, create 4,5 ms, patch 5,8 ms, delete 5,6 ms (umbral 200 ms ✓, caso peor: listado por serialización de 100 registros). RNF-2 — CSV de 50 000 filas × 8 columnas = **4,41 MB efectivos** (9 columnas medid 5,25 MB romperían el tope de 5 MB por 4 KB; se elige 4,4 MB honesto), subida completa (parseo + escaneo + alta) **534,8 ms** (umbral 2 s ✓), `content` fetch 31,7 ms. Módulo `core/perf.py` fuera del descubrimiento por defecto (solo con etiqueta `core.perf`).
- [x] **T15. Pasada e2e con servidor real** — recorrer CU-1..CU-6 con `curl` como en F0 (register → crear red → subir dataset → listar → editar → borrar), apuntando desviaciones a esta lista si aparecen.
      > 08-11-2026: 19 comprobaciones PASS (script temporal en `%TEMP%\opencode\e2e.ps1`): register/login, alta red + 422 acumulada (21 capas), PATCH mantiene config, CSV 422 reporte {row:3,col:3,total:1} sin persistir, CSV/JSON 201 stats, listado solo propio, content fiel, RF-6 ajeno=404, RF-7 401 ×3, RF-16 reinicio→GET 200, deletes 204→404. Redis servido vía Docker (`synforja-redis`, `--restart unless-stopped`; estaba caído, decisión del dueño arrancarlo con Docker). Sin desviaciones.
- [x] **T16. Cierre de fase** — `manage.py check` limpio, suite entera verde, resumen "qué construimos / cómo funciona / cómo se verifica" (§2) y actualizar AGENTS.md §12 (F5a → HECHA) + §14.
      > 08-11-2026: check limpio; suite **112 tests en ~3,7 s**; AGENTS §12 F5a = HECHA.

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
