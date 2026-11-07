# Spec 000 — CRUD de redes neuronales y datasets (F5a)

> Estado: **APROBADA** (06-11-2026). Contrato vigente; cualquier cambio vuelve a pasar por revisión.
> Enmienda 08-11-2026 (a petición del dueño): RF-18 adelanta los topes de red desde F5b; epochs/lr siguen sin tope hasta F5b. Acciones y criterios actualizados en consecuencia.

## 1. Contexto y objetivo

Synforja necesita que el usuario registrado pueda crear, consultar, modificar y borrar dos
tipos de recursos: **redes neuronales** (topología + hiperparámetros) y **datasets**
(datos de entrenamiento en CSV o JSON). Es la base sin la cual los endpoints de
entrenamiento y predicción no tienen con qué operar, y el editor no-code del frontend
no tiene modelo detrás. Todo recurso es **privado** del usuario que lo crea; la
autenticación por token ya está operativa y esta spec se apoya en ella.

La spec cubre el QUÉ del ciclo de vida de ambos recursos. El entrenamiento, la
predicción y la persistencia de pesos entrenados quedan fuera (fase siguiente).

## 2. Glosario

| Término | Definición |
|---------|------------|
| Red (Network) | Definición paramétrica de un modelo MLP: secuencia de capas con nº de neuronas y función de activación, más hiperparámetros. No incluye pesos; los pesos nacen al entrenar |
| Capa (Layer) | Elemento de la topología: nº de neuronas (≥1) + activación |
| Hiperparámetros | Epochs, learning rate, loss, training split y semilla que guiarán el entrenamiento |
| Semilla | Entero que permite reproducir la inicialización de pesos de forma determinista |
| Estado | Etapa de vida de una red: `draft` (sin entrenar), `training` (en proceso), `trained` (con métricas) |
| Dataset | Conjunto etiquetado de ejemplos numéricos para entrenar una red. Cada ejemplo: vector de entrada + vector de salida esperada |
| Nº columnas entrada | Valor que declara el usuario en cada dataset: cuántas columnas (o campos por fila JSON) son vectores de entrada |
| Validación | Comprobación de estructura y tipos de un subido sin alterar sus datos, con reporte de errores |
| Usuario autenticado | Usuario con credenciales de acceso válidas emitidas por el sistema |
| Dueño | Usuario autenticado que creó el recurso; único que puede verlo/editarlo/borrarlo |

## 3. Actores y casos de uso

- **Actor principal:** usuario registrado autenticado (dueño de sus recursos).
- **Actor secundario:** otro usuario autenticado que no posee el recurso (solo sirve para garantizar el aislamiento).
- **CU-1:** crear red — el usuario define capas e hiperparámetros; recibe el registro creado.
- **CU-2:** editar red — cambia topología o hiperparámetros; si estaba entrenada vuelve a `draft`.
- **CU-3:** consultar redes — listado completo o detalle individual de cada una.
- **CU-4:** borrar red — eliminación definitiva con todo lo que se genere de ella (métricas, pesos) cuando existan.
- **CU-5:** subir dataset CSV/JSON — declara nº de columnas de entrada; recibe validación y registro.
- **CU-6:** gestionar datasets — listarlos o borrarlos; son independientes de las redes hasta que se entrene.

## 4. Requisitos funcionales (EARS)

> Un requisito, una frase. Verificable. Con autenticación operativa como precondición general.

### Ciclo de vida (redes)

- RF-1: CUANDO un usuario autenticado envía una definición de red que cumple todas las reglas de negocio, EL SISTEMA creará el recurso en estado `draft`, lo asignará como suyo y devolverá su identificador más su configuración completa.
- RF-2: CUANDO el dueño solicite el detalle de su red, EL SISTEMA devolverá el registro completo: capas, hiperparámetros, semilla y estado.
- RF-3: CUANDO el dueño solicite su listado de redes, EL SISTEMA devolverá exclusivamente las redes que posee, ordenadas por fecha de creación descendente.
- RF-4: CUANDO el dueño envíe cambios a su red existente, EL SISTEMA actualizará la configuración y la validará como en el alta; SI la red estaba en estado `trained`, ENTONCES EL SISTEMA la devolverá al estado `draft`.
- RF-5: CUANDO el dueño solicite borrar su red, EL SISTEMA eliminará el recurso y todo artefacto asociado a él sin dejar copias.
- RF-6: SI una operación de red la intenta un usuario autenticado que no es su dueño, o el recurso no existe, ENTONCES EL SISTEMA responderá el mismo código de "no encontrado" en ambos casos, sin revelar la existencia del recurso.
- RF-7: SI una petición de gestión de redes llega sin credenciales válidas, ENTONCES EL SISTEMA responderá con el código de "no autenticado" para todas las operaciones.
- RF-8: SI una definición de red viola alguna regla de negocio, ENTONCES EL SISTEMA rechazará la operación devolviendo el código de "entidad no procesable" con la lista completa de violaciones, una entrada por violación, sin detenerse en la primera.

### Datasets

- RF-9: CUANDO un usuario autenticado suba un CSV junto con su nº de columnas de entrada y cumpla las reglas de negocio, EL SISTEMA lo almacenará como dataset suyo y devolverá identificador más estadísticas: nº total de filas, nº columnas de entrada y nº columnas de salida.
- RF-10: CUANDO un usuario autenticado suba un JSON estructurado en colecciones paralelas de entradas y salidas esperadas y cumpla las reglas de negocio, EL SISTEMA lo almacenará como dataset suyo y devolverá identificador más las mismas estadísticas que el CSV.
- RF-11: SI un dataset subido (CSV o JSON) contiene valores estructurales o numéricos inválidos, ENTONCES EL SISTEMA lo rechazará con el código de "entidad no procesable" y un reporte con ubicación exacta (fila y columna) de cada violación hasta un máximo de 100 entradas.
- RF-12: SI el archivo/solicitud del dataset supera alguno de los límites medibles (tamaño ≤ 5 MB, ≤ 50 000 filas, nº columnas de entrada entre 1 y total−1), ENTONCES EL SISTEMA lo rechazará antes de procesar su contenido, devolviendo el código de error correspondiente a cada límite excedido.
- RF-13: CUANDO el dueño solicite su listado de datasets o el detalle de uno suyo, EL SISTEMA devolverá el registro con sus estadísticas; el detalle incluirá la forma de obtener el contenido íntegro bajo demanda del dueño.
- RF-14: CUANDO el dueño solicite borrar su dataset, EL SISTEMA eliminará el recurso, que no arrastrará cambios en las redes.

### Reglas transversales

- RF-15: MIENTRAS exista un recurso con estado `training`, EL SISTEMA permitirá su lectura pero bloqueará su edición y borrado en esta fase. [Nota: `training` solo ocurre al conectar el entrenamiento; se define aquí para la máquina de estados completa]
- RF-16: CUANDO una operación de esta spec se ejecute con éxito, EL SISTEMA persistirá el resultado de forma que sobreviva al reinicio del servidor.
- RF-17: SI el nº total de violaciones de un dataset excede el límite de 100 del reporte, ENTONCES EL SISTEMA añadirá al reporte el conteo total real de violaciones.

- RF-18: SI una red excede los topes de volumen de la plataforma (más de 20 capas, o una capa con más de 2048 neuronas), ENTONCES EL SISTEMA lo rechazará con el código de entidad no procesable, acumulado junto al resto de violaciones de red (RF-8).

### Criterios de aceptación por RF

| RF | Criterio verificable | Cómo se comprueba |
|----|----------------------|-------------------|
| RF-1 | Alta devuelve 201 con `{id, layers[], hyperparams, seed, state: "draft"}` | POST válido vía API con token → comprobar cuerpo |
| RF-2 | GET propio devuelve todo el registro incluida la semilla | GET → comparar con la configuración enviada |
| RF-3 | Listado devuelve únicamente redes del dueño, ordenadas por creación descendente | Crear 2 usuarios con redes; el listado de uno no contiene las del otro |
| RF-4 | PATCH/PUT actualiza y `trained → draft` | Editar red `trained` → `state` sale `draft` |
| RF-5 | DELETE elimina la red y su detalle tras el borrado devuelve "no encontrado" | DELETE → GET siguiente → 404 |
| RF-6 | Recurso de otro dueño e inexistente devuelven el mismo código y no enumeran | Acceder al recurso de otro usuario → mismo código/cuerpo que la clave inexistente |
| RF-7 | Todas las rutas sin token → 401 | Quitar el encabezado de credenciales → responder 401 |
| RF-8 | Alta inválida devuelve 422 con N violaciones correspondientes | Enviar topología con 3 fallos simultáneos → llegar 3 entradas |
| RF-9 | CSV válido queda guardado con {total_rows, input_cols, output_cols} correctos | Subir CSV de referencia con cifras conocidas y comparar |
| RF-10 | Ídem JSON con cuentas en ambos bloques | Ídem con JSON de referencia |
| RF-11 | Errores devuelven por cada problema {row, column, motivo} hasta 100 entradas | Subir datasets con 3 filas mal y comprobar las 3 entradas |
| RF-12 | Excesos de límite se rechazan sin procesar el fichero | Subir dataset de 6 MB → código de tamaño excedido y ninguna alta en el listado |
| RF-13 | Detalle/listado incluye estadísticas y vía para el contenido íntegro | GET → registro con estadísticas; mecanismo de descarga existe |
| RF-14 | DELETE dataset → GET con id recibido devuelve 404 | DELETE → GET → 404 |
| RF-15 | Red en `training` bloquea edición/borrado con código de conflicto | Red en ese estado (fase siguiente) → editar → 409 |
| RF-16 | Crear → reiniciar servidor → recurso sigue accesible | Reinicio manual + GET |
| RF-17 | Reporte truncado expone el total exacto de violaciones | Subir dataset con 150 filas inválidas → 100 entradas + `total: 150` |
| RF-18 | Última capa válida (todas ≥ 1) y composed topes: 21 capas o capa de 2049 → 422 con 1 sola violación | 20×2049 → 2 entradas; 21×1 → 1 entrada |

## 5. Requisitos no funcionales

> Medibles, con umbral.

- RNF-1: EL SISTEMA responderá las operaciones de alta/lectura/edición/borrado de redes en menos de 200 ms (p95) con un usuario que posea hasta 100 redes.
- RNF-2: EL SISTEMA validará y almacenará un dataset de 5 MB / 50 000 filas en menos de 2 s (p95).
- RNF-3: EL SISTEMA limitará el reporte de errores de validación de dataset a 100 entradas listadas como máximo por respuesta, más un campo de conteo total.

## 6. Reglas de negocio

- RN-1: Una red tiene 2 o más capas, cada una con 1 o más neuronas; los contadores son enteros positivos.
- RN-2: Las activaciones permitidas son exactamente: `relu`, `sigmoid`, `tanh`, `softmax`, `linear` (comparación en minúsculas).
- RN-3: Hiperparámetros: epochs entero ≥ 1; learning rate real > 0 (sin tope); loss ∈ {`mse`, `bce`, `mae`}; training split real en el intervalo abierto (0, 1), excluyendo ambos extremos.
- RN-4: DONDE el alta de la red no incluya semilla, EL SISTEMA la generará y la almacenará en alta para que toda reproducción posterior sea determinista.
- RN-5: Los estados válidos son `draft`, `training`, `trained`; las transiciones son: alta → `draft`; editar tras `trained` → `draft` (la puerta `training`→`trained` se define en F5b).
- RN-6: Un dataset es un recurso independiente por usuario; su vinculación a redes ocurre solo durante el entrenamiento (fuera de alcance).
- RN-7: En un dataset todas las filas deben tener idéntica longitud y el nº de columnas de entrada debe ser mayor que 0 y menor que el total.
- RN-8: Todo valor del dataset debe interpretarse como número real finito (sin textos, nulos, NaN ni infinitos).

## 7. Casos límite y errores

| Condición | Comportamiento esperado |
|-----------|-------------------------|
| SI la creación/edición de red viola alguna RN | ENTONCES EL SISTEMA responderá 422 con la lista completa de violaciones (RF-8) |
| SI el dataset JSON llega con nº de elementos distinto entre entradas y salidas | ENTONCES EL SISTEMA responderá 422 indicando el desbalance |
| SI el CSV llega vacío o sin filas | ENTONCES EL SISTEMA responderá 422 |
| SI el JSON de datos llega con colecciones vacías | ENTONCES EL SISTEMA responderá 422 |
| SI hay filas de distinta longitud en el mismo dataset | ENTONCES EL SISTEMA responderá 422 listando cada fila/caso |
| SI un valor no es número finito (texto, nulo, NaN, inf) | ENTONCES EL SISTEMA lo reportará con fila y columna (RF-11) |
| SI el CSV contiene texto no numérico en cualquier fila (incluida una cabecera) | ENTONCES EL SISTEMA lo rechazará como valor inválido con su ubicación: los CSV se asumen siempre puros, sin cabecera |
| SI el usuario sube dos veces el mismo contenido | ENTONCES EL SISTEMA creará un dataset nuevo con id distinto, sin deduplicación |
| SI un usuario accede a un recurso de otro | ENTONCES EL SISTEMA responderá idéntico "no encontrado" (RF-6) |
| SI el usuario posee 0 redes/0 datasets | ENTONCES EL SISTEMA devolverá un listado vacío correcto (200, lista vacía) |
| SI el subido supera 50 000 filas, 5 MB o nº columnas de entrada fuera de [1, total−1] | ENTONCES EL SISTEMA responderá el error asociado sin procesar contenido (RF-12) |

## 8. Fuera de alcance

- Entrenamiento y predicción de redes (endpoints numéricos y conexión con el motor) — fase F5b.
- Persistencia y reglas de gestión de pesos entrenados — nace junto con el entrenamiento (fase F5b).
- Editor visual no-code, métricas, autenticación en la interfaz web — fase F6 (frontend).
- Unificación de nombres de tokens entre registro y login (pendiente de limpieza, residuo de F0).
- Historial de runs o versiones de red; control de versiones de modelos.
- Migración a base de datos de producción, despliegue e infraestructura.
- Cualquier tratamiento "inteligente" del CSV (cabeceras, detección de separadores, deduplicación): se asume CSV puro y re-subida como recurso nuevo.

## 9. Supuestos y dependencias

- Supuesto-1: la autenticación por token registrada en AGENTS.md (§14.12) está operativa y verificada end-to-end; esta spec no modifica sus endpoints ni el nombre de sus campos (`access`/`refresh` en registro, `access_token`/`refresh_token` en login, tal como vierten hoy).
- Supuesto-2: la constitución (docs/memory/constitution.md) rige: sin dependencias nuevas ni servicios nuevos; los servicios existentes (caché usada para rate-limit) ya quedaron justificados y esta spec no introduce más.
- Supuesto-3: los topes numéricos se adelantaron para la red (RF-18, capas ≤ 20 / neuronas por capa ≤ 2048, decidieron 08-11-2026 a petición del dueño); los topes de coste de entrenamiento (epochs máximos, tope de learning rate) siguen en F5b. (Redacción original: acordados todos en F5b, 06-11-2026.)
- Dependencia-1: ninguna spec previa; esta es 000.

## 10. Preguntas abiertas

Ninguna abierta. Las 5 anteriores quedaron resueltas en la clarificación del 06-11-2026:

1. Topes de volumen (capas/neuronas/epochs/lr) → deciden todos en F5b; aquí solo estructura.
2. Rangos → training split en el intervalo abierto (0, 1), exclusivo; learning rate > 0 sin tope.
3. CSV → siempre puro, sin cabecera ni auto-detección; el rechazo por texto no numérico ya cubre una cabecera accidental.
4. Reporte de errores → máx 100 entradas listadas + campo de conteo total real (RF-17).
5. Nombres de red/dataset → sin unicidad exigida por usuario; el id es la clave.
