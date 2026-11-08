# Spec 002 — Progreso del entrenamiento en vivo (streaming SSE)

> Estado: **APROBADA** (08-11-2026).
> Se apoya en la spec 001 (aprobada el 08-11-2026) y la enmienda en UNA sola cosa: la modalidad de respuesta del entrenamiento (RF-3 de 001 gana una alternativa de streaming). Todo lo demás de 001 rige sin cambios.

## 1. Contexto y objetivo

El entrenamiento aprobado en 001 es síncrono y sin tope de reloj (decisión del dueño): el
usuario lanza una corrida y espera ciego hasta la respuesta final, sin saber si la pérdida
baja, si diverge o si simplemente está tardando. Esta spec define el **flujo de eventos**:
la propia petición de entrenamiento puede responder como un stream donde el cliente observa
la curva de pérdida época a época (train y test) y recibe el run al terminar. El cálculo
sigue ejecutándose en el motor interno; la capa web solo valida, traduce y emite; las
gráficas del frontend son fase F6 y consumen este contrato. Ya aprobado con el dueño (08-11-2026):

- La petición de entrenamiento ES el stream (sin servicios, workers ni mensajería nueva; constitución compatible).
- Cada evento: pérdida de entrenamiento y de test de esa época; evento final: el run completo.
- Si el cliente corta la conexión a mitad de corrida, la corrida se cancela sin run.
- La curva vive solo dentro del stream; no se persiste.

## 2. Glosario

| Término | Definición |
|---------|------------|
| Streaming (SSE) | Respuesta HTTP que se queda abierta y por la que el servidor emite eventos en el tiempo; unidireccional servidor → cliente |
| Modalidad one-shot | El comportamiento aprobado en 001: petición → espera → respuesta única con el resultado |
| Evento de época | Unidad del stream que lleva el nº de época y las pérdidas de entrenamiento y de test medidas al cierre de esa época |
| Evento de arranque | Primer evento del stream: datos fijos de la corrida (configuración efectiva, nº de épocas planeadas, nº de ejemplos por partición) |
| Evento final | Último evento del stream: el run completo (id, métricas de test, dataset de origen con estadísticas) tras terminar con éxito |
| Evento de error | Evento que anuncia un aborto (divergencia numérica u error del motor) y cierra el stream |
| Cancelación por desconexión | Si el cliente corta la conexión antes del evento final, la corrida se detiene y no se crea run ni pesos |
| Curva | Serie completa de pérdidas por época; existe únicamente dentro del stream |
| Corrida | Sinónimo de entrenamiento individual (spec 001); aquí designa la que se observa en vivo |

## 3. Actores y casos de uso

- **Actor principal:** usuario registrado autenticado, dueño de la red y del dataset.
- **CU-1:** entrenar en vivo — el dueño lanza el entrenamiento en modalidad streaming y ve la curva época a época hasta el evento final con el run; la red queda `trained`.
- **CU-2:** entrenar one-shot — el dueño lanza el entrenamiento sin pedir streaming y recibe la respuesta única de la spec 001, con idéntico resultado y contratos.
- **CU-3:** abandonar — el dueño cierra la conexión a mitad de corrida; la corrida se cancela sin run, la red vuelve a `draft` (si llegó a arrancar) y puede relanzar cuando quiera.

## 4. Requisitos funcionales (EARS)

> Un requisito, una frase. Verificable. La autenticación y el aislamiento de la spec 001 aplican a ambas modalidades.

### Modalidad y arranque

- RF-1: DONDE el cliente solicite la modalidad de streaming para su solicitud de entrenamiento, EL SISTEMA responderá con un flujo de eventos en vez de una respuesta única.
- RF-2: CUANDO la solicitud de entrenamiento pase todas las validaciones de la spec 001, EL SISTEMA abrirá el stream con un evento de arranque que informe nº de épocas planeadas, nº de ejemplos de entrenamiento y de test.
- RF-3: CUANDO el motor complete cada época, EL SISTEMA emitirá un evento de época con su nº, la pérdida de entrenamiento y la de test, en orden ascendente y sin saltos.
- RF-4: CUANDO la corrida termine con éxito, EL SISTEMA emitirá un evento final con el run completo y dejará la red en `trained` con pesos y run persistidos (coherente con RF-4 de la spec 001).
- RF-5: CUANDO el cliente no solicite streaming, EL SISTEMA mantendrá íntegro el contrato one-shot de la spec 001.

### Cancelación y errores dentro del stream

- RF-6: SI el cliente corta la conexión antes del evento final, ENTONCES EL SISTEMA detendrá la corrida sin persistir pesos ni run y dejará la red en estado `draft`.
- RF-7: SI el entrenamiento diverge numéricamente a mitad del stream, EL SISTEMA emitirá un evento de error con el motivo y cerrará el stream dejando la red en `draft` sin pesos ni run (coherente con RF-10 de la spec 001).
- RF-8: SI el motor reporta un error no previsto a mitad del stream, EL SISTEMA emitirá un evento de error con el motivo y cerrará el stream conservando la red en su estado previo a la corrida.
- RF-9: SI el entrenamiento es rechazado por validación (compatibilidad de forma, topes de coste, presupuesto o split según 001), ENTONCES EL SISTEMA responderá el mismo error one-shot de la spec 001 aunque se haya pedido streaming, sin abrir el stream.

### Concurrencia y persistencia

- RF-10: SI una segunda solicitud de entrenamiento para la misma red (one-shot o streaming) llega mientras la corrida esté en curso en un stream, EL SISTEMA la rechazará con el código de "conflicto" (extiende RF-6 de la spec 001).
- RF-11: CUANDO el stream concluya (éxito, error o cancelación), EL SISTEMA cerrará el flujo sin dejar sesión ni estado de suscripción que sobreviva a la conexión.
- RF-12: EL SISTEMA no persistirá la curva ni ninguna serie por época; el run conserva solo las métricas finales de test (coherente con la decisión del dueño de no persistir la curva).

### Criterios de aceptación por RF

| RF | Criterio verificable | Cómo se comprueba |
|----|----------------------|-------------------|
| RF-1 | Pedir stream → la respuesta llega como flujo de eventos encadenados, no como JSON único | Lanzar entrenamiento pidiendo streaming y observar los eventos |
| RF-2 | El primer evento del stream anuncia épocas y particiones que coinciden con la configuración | Comparar con la red (epochs) y el dataset (filas × split) |
| RF-3 | El stream lleva exactamente `epochs` eventos de época, numerados 1..N en orden, cada uno con 2 pérdidas | Capturar el stream completo y contar/validar los eventos |
| RF-4 | El último evento es un run completo (con id) y su contenido coincide con GET runs | Capturar el stream + llamar a runs de 001 y comparar |
| RF-5 | Sin pedir streaming: respuesta única idéntica al contrato de 001 (y mismas métricas con misma semilla) | Lanzar ambos modos con misma semilla y comparar métricas |
| RF-6 | Cerrar la conexión a mitad → sin run nuevo (GET runs sin cambio) y red `draft` | Entrenar en stream, cortar la conexión, verificar runs y estado |
| RF-7 | Divergencia mid-stream → evento de error con motivo + stream cerrado + red `draft` + 0 runs | Forzar divergencia (lr alto) en modo stream y verificar |
| RF-8 | Error no previsto del motor → evento de error y red en estado previo | Simular fallo interno y verificar estado de la red | 
| RF-9 | Solicitud con incompatibilidad de forma/topes pidiendo stream → error one-shot (código de 001), sin streaming abierto | Red 6→2 contra dataset de `input_cols`=5 pidiendo streaming |
| RF-10 | Doble solicitud mientras stream en curso → 409 la segunda | Abrir stream + lanzar segunda petición paralela (cualquier moda) |
| RF-11 | Tras finalizar el stream no queda ninguna consulta que devuelva estado de suscripción | Cerrar el stream y comprobar que no hay endpoints de sesión/resumen |
| RF-12 | GET runs tras un stream exitoso devuelve 1 corrida con métricas finales y sin series | Capturar stream → consultar runs → verificar ausencia de series por época |

## 5. Requisitos no funcionales

> Medibles, con umbral. La "corrida de referencia" es la misma definida en RNF-1 de la spec 001.

- RNF-1: Para la corrida de referencia, EL SISTEMA emitirá el primer evento de época antes de 10 s y no dejará más de 10 s entre eventos de época consecutivos (p95).
- RNF-2: Para la corrida de referencia, EL SISTEMA completará la modalidad streaming en un tiempo menor que el doble de su tiempo one-shot (el coste de emitir no duplica la corrida).
- RNF-3: Para la corrida máxima legal en épocas (10 000), EL SISTEMA mantendrá el tamaño total del stream por debajo de 2 MB.

## 6. Reglas de negocio

- RN-1: La corrida en streaming consume exactamente los mismos topes y validaciones que la one-shot: epochs ≤ 10 000, lr ∈ (0, 1], presupuesto de pasos ≤ 5 000 000, split en (0, 1) y compatibilidad de forma red↔dataset (RN-1 y RF-7/8/9 de la spec 001).
- RN-2: El historial de runs no conserva series por época: solo métricas finales de test (decisión del dueño, 08-11-2026).
- RN-3: Ambas modalidades son equivalentes en resultado: misma semilla + mismo dataset + mismos hiperparámetros → mismas métricas y pesos, sea one-shot o streaming (RN-6 de la spec 001).
- RN-4: A lo sumo una corrida por red en curso; un stream en marcha bloquea la red igual que cualquier entrenamiento (RN-4 aplicada también aquí).

## 7. Casos límite y errores

| Condición | Comportamiento esperado |
|-----------|-------------------------|
| SI la validación de la corrida falla con streaming pedido | MISMO error one-shot de 001, sin abrir stream (RF-9) |
| SI el cliente cierra justo después del evento final | EL run ya existe y la red está `trained`; nada se cancela (la cancelación solo aplica antes del evento final) |
| SI el cliente se reconecta tras cancelar | NO hay corrida en curso (fue abortada); una nueva petición es una corrida nueva desde la época 1; sin soporte de resumen |
| SI dos pestañas lanzan el mismo entrenamiento | LA segunda recibe "conflicto" (RF-10); solo la primera corre |
| SI la divergencia llega en la época 1 | Evento de error inmediato tras el evento de arranque; sin eventos de época; red `draft` |
| SI el motor emite épocas no enteras o salta épocas | FALLO de implementación (RF-3 exige orden 1..N sin saltos): el stream se aborta con evento de error |
| SI el stream supera 2 MB con épocas máximas legales | Sintoma de violación de RNF-3: corregir implementación |
| SI se pide streaming para otra operación (predict, volcado) | NO soportado: fuera de alcance; solo el entrenamiento se emite en vivo |

## 8. Fuera de alcance

- Toda la visualización del frontend (gráficas, barras de progreso, refresco de componentes) — F6 consume este contrato.
- Resumir o reproducir una curva interrumpida; histórico de curvas (la curva muere con el stream).
- Cancelación manual desde la interfaz (no habrá endpoint "cancelar": cortar la conexión ES la cancelación).
- Streaming de progreso para otras operaciones (predict, volcado de pesos, validación de datasets, listados).
- WebSockets u otro transporte; mensajería, colas o servicios nuevos.
- Cambios en el contrato de 001 fuera de la modalidad de respuesta del entrenamiento (predict, runs, volcado, CRUD).

## 9. Supuestos y dependencias

- Supuesto-1: la spec 001 está aprobada (08-11-2026) y rige: esta spec la enmienda exclusivamente en la modalidad de respuesta del entrenamiento (RF-1 y RF-2 de este documento operan sobre RF-3 de 001); nada más se toca.
- Supuesto-2: la constitución se mantiene: entrenamiento síncrono (el stream es la propia respuesta HTTP), sin servicios nuevos, cálculo en el motor interno, frontend sin cálculo.
- Supuesto-3: emitir pérdidas por época exige que el motor relate progreso (hoy entrega solo métricas finales); el HOW del relato y del empaque del stream se resuelve en el plan de esta spec, no aquí.
- Dependencia-1: spec 001 — entrenamiento one-shot, runs, pesos, predicción (APROBADA, 08-11-2026).
- Dependencia-2: spec 000 — CRUD de redes y datasets (APROBADA, 06-11-2026/08-11-2026).

## 10. Preguntas abiertas

Ninguna. Las 3 de la entrevista del 08-11-2026 quedaron resueltas:

1. Modalidad → la petición de entrenamiento emite el stream como respuesta; cierre del cliente = cancelación sin run (red a `draft`).
2. Contenido por evento → pérdida de train y de test por época; evento de arranque al abrir; evento final con el run.
3. Persistencia de la curva → no; solo en vivo, el run queda con métricas finales (enmienda mínima a la spec 001: modalidad de respuesta del entrenamiento).
