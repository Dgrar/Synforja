# Spec 001 — Entrenamiento, runs y predicción (F5b)

> Estado: **APROBADA** (08-11-2026). Umbral del volcado (RF-15) confirmado por el dueño: 50 MB.
> Apoya a la spec 000 (aprobada, con enmiendas I y II del 08-11-2026); no modifica su contrato, solo lo completa con las operaciones numéricas pendientes.
> Streaming (SSE) del progreso del entrenamiento: decisión del dueño del 08-11-2026 — spec propia (002) posterior, no esta.

## 1. Contexto y objetivo

La spec 000 dejó los recursos listos (redes `draft` con semilla obligatoria y datasets validados
con estadísticas), pero ninguna forma de convertirlos en modelo real. Esta spec añade las cuatro
operaciones que hacen útil el producto: **entrenar** una red contra un dataset del dueño y
recibir métricas honestas medidas sobre la partición de test, **conservar el histórico de
corridas (runs)** para comparar iteraciones, **descargar los pesos** entrenados como volcado
reconstruible y **predecir** con la red entrenada. Todo entrenamiento es síncrono (constitución)
y el cálculo pesado lo ejecuta el motor numérico interno del sistema; la capa web solo
valida, orquesta y persiste.

## 2. Glosario

| Término | Definición |
|---------|------------|
| Entrenamiento | Proceso que ajusta los pesos de una red usando un dataset: divide el dataset en particiones de entrenamiento y test según el training split de la red, y mide las métricas solo sobre test |
| Run (corrida) | Registro histórico inmutable de un entrenamiento completado: métricas de test, dataset de origen (id + estadísticas) y fecha |
| Pesos entrenados | Matrices de pesos y sesgos resultantes de un entrenamiento; persistidos con la red |
| Volcado de pesos | Representación JSON completa (definición de red + hiperparámetros + semilla + pesos y sesgos) que permite reconstruir la red de forma determinista fuera del sistema |
| Predicción | Cálculo del vector de salida de una red en estado `trained` para un vector de entrada |
| Presupuesto de pasos | Límite compuesto de coste: epochs × nº total de filas del dataset ≤ 5 000 000 |
| Métricas de test | El conjunto estándar del producto: `mse_loss`, `r_square`, `accuracy`, medida sobre la partición de test |
| Semilla | Entero que gobierna de forma determinista toda aleatoriedad del entrenamiento (inicialización y orden de presentación de los ejemplos) |
| Determinismo | Propiedad por la cual la misma red + hiperparámetros + semilla + dataset producen métricas y pesos idénticos en la misma máquina |

## 3. Actores y casos de uso

- **Actor principal:** usuario registrado autenticado, dueño de la red y del dataset.
- **CU-1:** entrenar red — el dueño pide entrenar su red (`draft` o `trained`) contra un dataset suyo; el sistema valida compatibilidad y topes, ejecuta, persiste pesos y run, y responde con las métricas; la red queda `trained`.
- **CU-2:** re-entrenar — el dueño repite el entrenamiento (misma u otra configuración/dataset); se añade una corrida nueva y el histórico completo permanece.
- **CU-3:** consultar runs — el dueño ve todas las corridas históricas de una red suya, con métricas y dataset de origen.
- **CU-4:** descargar pesos — el dueño obtiene el volcado JSON completo de una red suya en estado `trained`.
- **CU-5:** predecir — el dueño envía un vector de entrada a su red `trained` y recibe el vector de salida.

## 4. Requisitos funcionales (EARS)

> Un requisito, una frase. Verificable. Precondición general: autenticación operativa (spec 000) y aislamiento por dueño en todo lo nuevo.

### Transversales (extienden la spec 000)

- RF-1: SI una operación de esta spec llega sin credenciales válidas, ENTONCES EL SISTEMA responderá con el código de "no autenticado".
- RF-2: SI una operación de esta spec apunta a un recurso ajeno o inexistente (red o dataset), ENTONCES EL SISTEMA responderá el mismo código de "no encontrado" fijado por la spec 000, sin revelar la existencia del recurso.

### Entrenamiento

- RF-3: CUANDO el dueño solicite entrenar su red en estado `draft` o `trained` contra un dataset suyo existente, EL SISTEMA ejecutará el entrenamiento completo y responderá con su resultado en la misma petición.
- RF-4: CUANDO un entrenamiento termine con éxito, EL SISTEMA persistirá los pesos entrenados con la red, marcará la red en estado `trained` y creará un run con las métricas de test, que será el cuerpo de la respuesta junto con su identificador.
- RF-5: CUANDO el dueño solicite entrenar una red ya en estado `trained`, EL SISTEMA añadirá una corrida nueva al histórico sin alterar las anteriores.
- RF-6: SI la red objetivo está en estado `training`, ENTONCES EL SISTEMA rechazará un nuevo entrenamiento para ella con el código de "conflicto".
- RF-7: SI la topología de la red no es compatible con el dataset (nº de neuronas de la primera capa distinto del nº de columnas de entrada, o el de la última distinto del nº de columnas de salida), ENTONCES EL SISTEMA responderá "entidad no procesable" indicando la incompatibilidad sin ejecutar el entrenamiento.
- RF-8: SI la configuración de coste viola los topes de la fase (epochs > 10 000, learning rate fuera de (0, 1] o presupuesto de pasos excedido), ENTONCES EL SISTEMA responderá "entidad no procesable" indicando qué tope se excede, sin ejecutar el entrenamiento.
- RF-9: SI el training split de la red deja 0 ejemplos en la partición de entrenamiento o 0 en la de test, ENTONCES EL SISTEMA responderá "entidad no procesable" sin ejecutar el entrenamiento.
- RF-10: SI el entrenamiento aborta por resultado numérico no finito (divergencia), EL SISTEMA responderá "entidad no procesable" con el motivo, dejará la red en estado `draft` sin pesos y sin run.
- RF-11: MIENTRAS exista un entrenamiento en curso para una red, EL SISTEMA bloqueará su edición y su borrado con el código de "conflicto" (realiza el RF-15 de la spec 000).

### Consulta de runs

- RF-12: CUANDO el dueño solicite las corridas de su red, EL SISTEMA devolverá todas, ordenadas por fecha descendente, cada una con sus métricas de test y el dataset de origen con id y estadísticas.
- RF-13: CUANDO una red no tenga corridas completadas, EL SISTEMA devolverá un listado vacío correcto.

### Pesos entrenados

- RF-14: CUANDO el dueño solicite el volcado de pesos de su red en estado `trained`, EL SISTEMA devolverá un JSON que contiene definición de red, hiperparámetros, semilla, pesos y sesgos: todo lo necesario para reconstruir la red de forma determinista fuera del sistema.
- RF-15: SI el volcado de pesos de una red supera 50 MB, ENTONCES EL SISTEMA responderá con el código de "contenido demasiado grande" sin volcar.
- RF-16: CUANDO una red en estado `trained` sea editada (edición de la spec 000), EL SISTEMA la dejará en `draft` manteniendo intacto su histórico de runs, y no volverá a ser predecible ni descargable hasta un nuevo entrenamiento con éxito.

### Predicción

- RF-17: CUANDO el dueño envíe un vector de entrada a su red en estado `trained`, EL SISTEMA devolverá el vector de salida calculado en el mismo orden de neuronas de salida.
- RF-18: SI la red no está en estado `trained`, ENTONCES EL SISTEMA rechazará la predicción con el código de "conflicto".
- RF-19: SI el vector de entrada no coincide con el nº de neuronas de la primera capa o contiene algún valor no numérico finito, ENTONCES EL SISTEMA responderá "entidad no procesable" sin calcular nada.

### Persistencia

- RF-20: CUANDO una operación de esta spec se complete con éxito, EL SISTEMA persistirá pesos y runs de forma que sobrevivan al reinicio del servidor.

### Criterios de aceptación por RF

| RF | Criterio verificable | Cómo se comprueba |
|----|----------------------|-------------------|
| RF-1 | Sin token: entrenar, runs, volcado y predict → 401 | Quitar encabezado de credenciales en las 4 operaciones |
| RF-2 | Recurso ajeno o inexistente → mismo 404 (con cuerpo idéntico que el de la spec 000) | Entrenar la red de otro usuario; entrenar con id de dataset inexistente |
| RF-3 | La respuesta llega una vez terminado el entrenamiento (no antes) | Marcar tiempo de inicio/fin de la petición y comparar contra un entrenamiento de referencia conocido |
| RF-4 | Tras 201/200: red `trained`, pesos persistidos, run con métricas en la respuesta | Entrenar red válida → GET detalle (`trained`) + GET runs (1 fila) |
| RF-5 | Re-entrenar red `trained` → el histórico crece a 2 y la primera corrida está intacta | Entrenar dos veces → GET runs devuelve 2 corridas con fechas distintas |
| RF-6 | Doble entrenamiento simultáneo sobre la misma red: la II → 409 | Dos peticiones concurrentes sobre la misma red |
| RF-7 | Red 6→2 con dataset de `input_cols`=5 → 422 con motivo de incompatibilidad, y sin run creado | POST entrenamiento con red/dataset de tamaños cruzados; GET runs → 0 |
| RF-8 | epochs 10 001, lr 1,1 o presupuesto excedido → 422 indicando el tope violado (una petición por caso) | Los 3 casos por separado; ninguna corrida nueva |
| RF-9 | Dataset grande con split que deja 0 train o 0 test → 422 sin ejecutar | Red con split 0,999… sobre dataset pequeño; ídem split mínimo |
| RF-10 | Divergencia (pesos NaN/inf) → 422 con motivo, red vuelve a `draft` sin pesos activo y 0 runs | Forzar divergencia con lr alto y verificar estado tras el fallo |
| RF-11 | Con red `training`: PATCH → 409 y DELETE → 409 | Entrenamiento en curso + edición/borrado en paralelo |
| RF-12 | GET runs → orden fecha desc idéntico al orden de entrenamiento; cada fila con métricas + dataset id + estadísticas | Entrenar 3 veces con datasets distintos y comparar orden y contenidos |
| RF-13 | Red nunca entrenada → listado vacío | GET runs de red recién creada → 200 con lista vacía |
| RF-14 | El volcado contiene definición + hiperparámetros + semilla + pesos/sesgos y reconstruye = original | Descargar volcado, reconstruir en el propio sistema con semilla: mismas métricas que el run |
| RF-15 | Volcado estimado > 50 MB → 413 sin cuerpo de volcado | Red de topes máximos entrenada → solicitar volcado |
| RF-16 | PATCH sobre red `trained` → la red sale `draft`; runs intactos; predict → 409; volcado → 409 | Editar y consultar: estado, runs, predict y volcado |
| RF-17 | Vector de longitud correcta → vector de salida de longitud = neuronas de última capa | Enviar vector de ejemplo y comprobar la longitud |
| RF-18 | Red `draft` → predict 409 | Predecir red recién creada |
| RF-19 | Vector de longitud errónea → 422; vector con `"x"`/NaN en una posición → 422 | Los dos casos por separado |
| RF-20 | Crear red + dataset → entrenar → detener y rearrancar el servidor → GET detalle `trained` + GET runs y volcado disponibles | Reinicio manual + consultas (esquema RF-16 de la spec 000) |

## 5. Requisitos no funcionales

> Medibles, con umbral.

- RNF-1: EL SISTEMA completará en menos de 5 minutos (p95) un entrenamiento de referencia con carga de pasos dentro del presupuesto legal (epochs × filas ≤ 5 000 000, RN-1), concretamente: 5 000 filas × 7 columnas, 1 000 epochs, sobre una red de 4 capas con máximo 64 neuronas por capa. [Enmiendas 08-11-2026: el texto original (50 000 filas × 1 000 epochs, < 30 s) violaba el propio presupuesto de pasos de RN-1; el dueño aprobó la regla general "la referencia siempre bajo el presupuesto" con 5 000 × 1 000 como ejemplo concreto, y elevó después el umbral a 5 minutos porque una red relativamente densa no llega a entrenar nada en 60 s.]
- RNF-2: EL SISTEMA responderá una predicción individual en menos de 200 ms (p95), incluso sobre la red de topes máximos (20 capas × 2048 neuronas).
- RNF-3: EL SISTEMA responderá el listado de runs de una red con 100 corridas en menos de 200 ms (p95).
- RNF-4: EL SISTEMA será determinista: el mismo entrenamiento (mismos hiperparámetros, semilla y dataset) ejecutado dos veces en la misma máquina producirá métricas idénticas bit a bit.

## 6. Reglas de negocio

- RN-1: Topes de coste de esta fase: epochs ≤ 10 000; learning rate > 0 y ≤ 1; presupuesto de pasos epochs × nº filas del dataset ≤ 5 000 000.
- RN-2: Solo una red en estado `trained` es predecible y descargable.
- RN-3: La vinculación red↔dataset es temporal por llamada: ningún dataset queda asignado a la red tras entrenar; el run histórico solo conserva la referencia informativa (id + estadísticas).
- RN-4: Borrar un dataset usado por runs anteriores no altera esos runs ni los pesos ya entrenados.
- RN-5: Borrar una red elimina también sus pesos y todo su histórico de corridas (coherente con RF-5 de la spec 000).
- RN-6: Todo entrenamiento es determinista gobernado por la semilla de la red: misma semilla + mismo dataset + mismos hiperparámetros → mismas métricas y pesos.
- RN-7: Un run es inmutable una vez creado: editar la red no reescribe sus corridas pasadas.

## 7. Casos límite y errores

| Condición | Comportamiento esperado |
|-----------|-------------------------|
| SI se re-entrena la red de forma simultánea | LA II petición 409; la I completa su corrida (RF-6) |
| SI el dataset de un run histórico se borra después | EL run y sus métricas quedan intactos con su referencia id + estadísticas (RN-4); para re-entrenar hará falta subir un dataset nuevo |
| SI el entrenamiento diverge numéricamente (lr alto, pesos NaN/inf) | 422, red a `draft` sin pesos y run 0 (RF-10); reintentable |
| SI una red de topes máximos × presupuesto de pasos completo tarda mucho | SE asume esperado y aceptado (decisión del dueño, sin tope de reloj); no es error |
| SI el motor numérico reporta un error no previsto | 500 sin persistir estado parcial de la corrida; la red conserva su estado previo |
| SI el volcado de pesos supera 50 MB | 413 sin cuerpo de volcado (RF-15) |
| SI un vector de predict tiene longitud correcta pero valores no finitos ("x", nulo, NaN, inf) | 422 con posición del valor reportada (RF-19) |
| SI la red vuelve a `draft` por edición y luego se re-entrena | NUEVO run; el histórico acumula ambas corridas sin conflicto |
| SI la red se borra | SE eliminan sus pesos y todas sus corridas (RN-5) |
| SI el split deja la partición de test vacía (dataset de 1 fila con split 0,…) | 422 sin ejecutar (RF-9) — un dataset de esa fila es legal en la spec 000, pero no entrenable |
| SI el dueño borra el run… | DATO no soportado: los runs no se borran individualmente (solo con la red) |

## 8. Fuera de alcance

- Librería externa para importar los volcados de pesos en scripts personales del dueño — objetivo futuro declarado, otra fase.
- Métricas adicionales o evolución de la pérdida durante el entrenamiento (matriz de confusión, curvas por época): el run solo guarda las métricas de test finales.
- Entrenamiento asíncrono, colas de trabajo, workers o cancelación manual de una corrida en curso.
- Tope de duración en reloj del entrenamiento (decisión del dueño del 08-11-2026: no).
- Todo frontend: interfaz, visualizaciones de métricas o de pesos (F6).
- Migración a producción, despliegue e infraestructura.
- Cambiar el contrato CRUD de redes/datasets de la spec 000 (esta spec solo lo consume).
- Progreso del entrenamiento en vivo (streaming/SSE) y sus gráficas — spec 002 posterior según decisión del dueño (08-11-2026).
- Unificación de nombres de tokens de registro/login (residuo de F0, limpieza aparte pendiente).

## 9. Supuestos y dependencias

- Supuesto-1: la spec 000 está aprobada y operativa: redes con semilla obligatoria, datasets validados con estadísticas (`input_cols`/`output_cols`/`total_rows`), aislamiento por dueño y máquina de estados `draft`/`training`/`trained`.
- Supuesto-2: la constitución rige íntegra: el cálculo numérico lo ejecuta el motor interno (frontera: la capa web no hace matemática de red), entrenamiento síncrono, sin servicios nuevos.
- Supuesto-3: las reglas de red/dataset ya fijadas en la spec 000 (activaciones, hiperparámetros base epochs ≥ 1, lr > 0, split en (0,1), topes de volumen RF-18) se aplican tal cual; esta spec solo añade los topes de coste de entrenamiento que la 000 aplazó.
- Dependencia-1: spec 000 — CRUD de redes y datasets (aprobada 06-11-2026, enmiendas del 08-11-2026).

## 10. Preguntas abiertas

Ninguna bloqueante. Las 6 de la entrevista del 08-11-2026 quedaron resueltas:

1. Runs → histórico acumulado, sin límite (GET plural).
2. Trazabilidad → cada run recuerda dataset id + estadísticas.
3. Pesos → descargables como volcado JSON; la librería externa futura queda fuera de alcance.
4. Predict → un vector de entrada por llamada.
5. Topes de coste → presupuesto de pasos (epochs ≤ 10 000, lr ≤ 1, epochs × filas ≤ 5 000 000).
6. Tope de reloj → no; se acepta que combinaciones legales extremas puedan tardar.

Umbral del volcado de pesos confirmado en 50 MB el 08-11-2026. El progreso en vivo del
entrenamiento que pedía el dueño se tratará en la spec 002 (decisión del mismo día);
no altera esta spec.
