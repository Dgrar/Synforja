# Spec 003 — Interfaz web no-code (F6)

> Estado: **APROBADA** (14-11-2026); **enmendada** el 14-11-2026 para sesión cookie-only.
> Se apoya en las specs 000, 001 y 002 (aprobadas y cerradas). Decisiones de la entrevista del 14-11-2026:
> F6 completo; topología como lista de capas con previsualización visual; predicción, comparación de
> corridas, descarga de pesos y consulta/descarga de datasets incluidas; corte de red avisa y permite
> relanzar manualmente; sesión persistente con renovación automática mediante cookies HttpOnly; consumo
> de la API aprobada con una ampliación de sesión (autenticación por cookie, refresh, me, logout y CSRF). Preguntas
> del borrador resueltas el 14-11-2026: confirmación al salir durante el vivo; contraseña mínima de 8 con
> confirmación; vista previa de 200 filas/100 ejemplos; comparación de 2 a 4 corridas; diseño responsive
> de 360 a 1920 px; accesibilidad por teclado, foco visible y etiquetas.
> **Enmienda de sesión (14-11-2026):** las credenciales de sesión (access/refresh) no se guardan en
> `localStorage` ni son accesibles desde JavaScript; el navegador recibe cookies HttpOnly y el frontend
> nunca manipula credenciales. Login y registro dejan de devolver tokens en el cuerpo; se añaden `/csrf`,
> `/me`, `/refresh` por cookie y `/logout`, con CSRF de doble envío. Aprobado por el dueño.

## 1. Contexto y objetivo

La API ya permite registrarse, gestionar redes y datasets, entrenar en modalidad one-shot o en vivo,
consultar corridas, predecir y descargar pesos; pero usarla exige peticiones manuales. Esta spec define
la interfaz web que hace la plataforma usable sin código para su dueño: construir una red viendo su
topología, entrenarla observando la curva, y consultar o reutilizar los resultados. Se apoya en los
contratos aprobados sin reabrirlos; la ampliación acordada es la sesión por cookies HttpOnly (auth por
cookie, renovación, `me`, `logout` y CSRF), necesaria para que la sesión persista sin exponer tokens a
JavaScript. La interfaz no calcula nada: muestra y envía lo que la API valida y devuelve.

## 2. Glosario

| Término | Definición |
|---------|------------|
| Visitante | Persona sin sesión iniciada. |
| Usuario registrado | Persona con sesión iniciada y dueña de sus redes y datasets. |
| Sesión | Vínculo autenticado entre el usuario y la interfaz, compuesto por una credencial de acceso y una de renovación transportadas en cookies HttpOnly. |
| Cookie HttpOnly | Cookie que el navegador envía automáticamente y que JavaScript no puede leer; transporta las credenciales de sesión. |
| Credencial de acceso | Credencial efímera que autoriza cada operación privada; viaja en una cookie HttpOnly. |
| Credencial de renovación | Credencial de vida más larga que permite obtener una nueva credencial de acceso sin volver a introducir la contraseña; viaja en una cookie HttpOnly. |
| Token CSRF | Valor que el frontend envía en una cabecera y que la API compara con su cookie para aceptar escrituras autenticadas por cookie; impide Cross-Site Request Forgery (que otro sitio fuerce operaciones). |
| Red | Configuración de una red neuronal simple: capas, hiperparámetros y semilla. |
| Capa | Conjunto de neuronas con un tamaño y una activación; su orden define la topología. |
| Topología | Secuencia ordenada de capas de una red. |
| Previsualización | Representación visual de la topología (capas y conexiones) que refleja los valores del formulario; no calcula salidas ni métricas. |
| Dataset | Conjunto de ejemplos usado para entrenar, en formato tabular (CSV) o estructurado (JSON). |
| Dataset tabular | Dataset con columnas de entrada y columnas esperadas, declarado con un número de columnas de entrada. |
| Dataset estructurado | Dataset de pares entradas/esperados sin declaración de columnas de entrada. |
| Reporte de violaciones | Lista de problemas de un dataset rechazado, con fila, columna y motivo, más el total de problemas. |
| Entrenamiento one-shot | Entrenamiento que espera y devuelve el resultado final en una sola respuesta, sin progreso intermedio. |
| Entrenamiento en vivo | Entrenamiento que entrega eventos por época mientras la corrida avanza. |
| Época | Pasada completa por los ejemplos de entrenamiento. |
| Curva | Serie de pérdidas de entrenamiento y de test por época; existe solo durante la modalidad en vivo. |
| Corrida (run) | Resultado persistido de un entrenamiento: métricas finales y dataset de origen. |
| Pesos | Parámetros numéricos de una red entrenada; su volcado permite descargarlos. |
| Predicción | Salida de una red entrenada para un vector de entrada. |
| Estado borrador | Red creada o editada que no tiene pesos utilizables. |
| Estado entrenando | Red con una corrida en curso; no admite edición, borrado ni otra corrida. |
| Estado entrenada | Red con pesos válidos, lista para predecir o descargar pesos. |
| Semilla | Valor que fija la aleatoriedad de inicialización y mezcla; misma semilla y configuración producen el mismo resultado. |

## 3. Actores y casos de uso

- **Actor principal:** usuario registrado, dueño de sus redes y datasets.
- **Actor secundario:** visitante.
- **CU-1:** registrarse y acceder — el visitante crea una cuenta o inicia sesión, y la sesión persiste entre recargas y se renueva sola.
- **CU-2:** gestionar redes — el usuario crea o edita una red con nombre, capas ordenadas e hiperparámetros, viendo la previsualización de la topología; lista, abre y elimina sus redes.
- **CU-3:** gestionar datasets — el usuario crea un dataset desde un archivo o texto pegado, ve el reporte si se rechaza, lista, abre, descarga su contenido y lo elimina.
- **CU-4:** entrenar en vivo — el usuario elige red y dataset, observa época a época la curva de entrenamiento y test, puede cancelar, y al terminar ve el run y la red entrenada.
- **CU-5:** entrenar one-shot — el usuario lanza la corrida, ve un estado de espera y recibe el resultado final.
- **CU-6:** consultar corridas — el usuario lista las corridas de una red y compara varias lado a lado.
- **CU-7:** predecir — el usuario envía un vector a una red entrenada y ve la salida.
- **CU-8:** descargar pesos — el usuario descarga el volcado de pesos de una red entrenada.
- **CU-9:** cerrar sesión — el usuario termina su sesión; las vistas privadas dejan de estar accesibles.

## 4. Requisitos funcionales (EARS)

> Un requisito, una frase. Verificable.

### Sesión

- RF-1: CUANDO un visitante envíe un registro con datos aceptados por la API, EL SISTEMA creará la cuenta, establecerá una sesión mediante cookies HttpOnly y lo llevará al panel.
- RF-2: SI el registro es rechazado por datos inválidos, duplicado o límite de intentos, ENTONCES EL SISTEMA mostrará el motivo devuelto por la API sin iniciar sesión.
- RF-3: CUANDO un visitante envíe credenciales aceptadas, EL SISTEMA establecerá una sesión mediante cookies HttpOnly y lo llevará al panel.
- RF-4: SI las credenciales son rechazadas, ENTONCES EL SISTEMA mostrará un mensaje genérico de credenciales inválidas sin indicar si la cuenta existe.
- RF-5: MIENTRAS exista una sesión válida, EL SISTEMA permitirá el acceso a las vistas privadas y realizará cada operación como el usuario autenticado usando la cookie de acceso, sin manipular credenciales desde JavaScript.
- RF-6: CUANDO una operación privada sea rechazada porque la cookie de acceso caducó y la cookie de renovación siga siendo válida, EL SISTEMA renovará la sesión y repetirá la operación una vez.
- RF-7: SI la API rechaza la renovación por cookie inválida o ausente, ENTONCES EL SISTEMA redirigirá al acceso, conservará la vista solicitada y la abrirá tras autenticarse.
- RF-8: CUANDO el usuario cierre sesión, EL SISTEMA solicitará el logout a la API, que hará que el navegador descarte las cookies de sesión, y lo llevará al acceso.

### Redes

- RF-9: CUANDO el usuario cree o edite una red, EL SISTEMA le permitirá definir nombre, capas en orden con tamaño y activación, épocas, tasa de aprendizaje, pérdida, proporción de test y semilla opcional.
- RF-10: MIENTRAS el usuario edite la topología, EL SISTEMA mostrará una previsualización visual de capas y conexiones que refleje orden, tamaño y activación y se actualice con cada cambio local sin recargar la vista.
- RF-11: SI la creación o edición es rechazada, ENTONCES EL SISTEMA mostrará cada violación asociada a su campo y conservará los valores introducidos.
- RF-12: CUANDO el usuario guarde cualquier cambio sobre una red entrenada, EL SISTEMA pedirá confirmación advirtiendo que perderá pesos y predicciones y que la red volverá a borrador.
- RF-13: CUANDO el usuario consulte sus redes, EL SISTEMA mostrará solo las suyas con nombre, estado y tamaño de la topología, y permitirá abrir el detalle.
- RF-14: CUANDO el usuario elimine una red, EL SISTEMA pedirá confirmación explícita antes de borrarla.
- RF-15: SI la eliminación es rechazada porque la red está entrenando o ya no existe, ENTONCES EL SISTEMA mostrará el motivo y refrescará la lista.

### Datasets

- RF-16: CUANDO el usuario cree un dataset, EL SISTEMA le permitirá indicar nombre, tipo de origen y contenido cargado desde un archivo local o pegado como texto.
- RF-17: DONDE el dataset sea tabular, EL SISTEMA solicitará el número de columnas de entrada.
- RF-18: SI el dataset es rechazado por estructura, tamaño o límites, ENTONCES EL SISTEMA mostrará el reporte de violaciones con fila, columna y motivo (hasta 100 entradas) y el total, sin guardar el dataset.
- RF-19: CUANDO el usuario consulte sus datasets, EL SISTEMA mostrará solo los suyos con nombre, tipo, tamaño y número de filas, y permitirá abrir el detalle.
- RF-20: CUANDO el usuario solicite el contenido de un dataset, EL SISTEMA mostrará una vista previa de hasta 200 filas (tabular) o 100 ejemplos (estructurado) y permitirá descargar el contenido completo con su tipo de origen.
- RF-21: SI el contenido no puede cargarse, ENTONCES EL SISTEMA mostrará el motivo y ofrecerá reintentar sin mostrar contenido parcial.
- RF-22: CUANDO el usuario elimine un dataset, EL SISTEMA pedirá confirmación explícita antes de borrarlo.

### Entrenamiento

- RF-23: CUANDO el usuario elija entrenar una red propia contra un dataset propio, EL SISTEMA le permitirá elegir modalidad en vivo u one-shot y lanzará la solicitud con la configuración guardada.
- RF-24: SI la API rechaza el lanzamiento por validación, conflicto o incompatibilidad, ENTONCES EL SISTEMA mostrará el motivo y no mostrará curva ni run.
- RF-25: MIENTRAS la modalidad en vivo esté en curso, EL SISTEMA mostrará la época actual, el total de épocas y una curva de pérdida de entrenamiento y de test que se actualice con cada evento recibido.
- RF-26: MIENTRAS la modalidad en vivo esté en curso, EL SISTEMA ofrecerá cancelar cerrando la corriente de eventos.
- RF-27: CUANDO el usuario cancele antes del evento final, EL SISTEMA mostrará que la corrida se canceló sin run y que la red volvió a borrador.
- RF-28: CUANDO el entrenamiento termine con éxito, EL SISTEMA mostrará el run resultante con sus métricas y el estado entrenado de la red.
- RF-29: SI la corriente se interrumpe por un fallo ajeno a la acción del usuario, ENTONCES EL SISTEMA avisará que la corrida se canceló sin run y ofrecerá relanzar manualmente desde la primera época.
- RF-30: SI la API informa divergencia u otro error durante la modalidad en vivo, ENTONCES EL SISTEMA mostrará el motivo y el estado final de la red informado por la API.
- RF-31: MIENTRAS la modalidad one-shot esté en curso, EL SISTEMA mostrará un estado de espera sin mostrar épocas ni curva simuladas.
- RF-32: SI el usuario intenta navegar fuera, recargar o cerrar la pestaña mientras la modalidad en vivo está en curso, ENTONCES EL SISTEMA pedirá confirmación advirtiendo que la corrida se cancelará sin run.

### Corridas y comparación

- RF-33: CUANDO el usuario consulte las corridas de una red, EL SISTEMA las mostrará de la más reciente a la más antigua con sus métricas y el dataset de origen.
- RF-34: CUANDO el usuario seleccione entre dos y cuatro corridas, EL SISTEMA las mostrará lado a lado con sus métricas y el dataset de origen.

### Predicción

- RF-35: CUANDO el usuario envíe un vector de entrada a una red entrenada, EL SISTEMA mostrará el vector de salida devuelto por la API en el mismo orden.
- RF-36: SI la predicción es rechazada porque la red no está entrenada, la forma no coincide o hay valores no finitos, ENTONCES EL SISTEMA mostrará el motivo sin calcular una salida local.

### Pesos

- RF-37: CUANDO el usuario solicite los pesos de una red entrenada, EL SISTEMA descargará el volcado devuelto por la API.
- RF-38: SI los pesos no están disponibles o la descarga falla, ENTONCES EL SISTEMA mostrará el motivo sin generar un archivo vacío.

### Criterios de aceptación por RF

| RF | Criterio verificable | Cómo se comprueba |
|----|----------------------|-------------------|
| RF-1 | Cuenta creada, cookies HttpOnly presentes y panel visible | Registrar un visitante nuevo y comprobar `Set-Cookie` y el panel |
| RF-2 | Motivo visible y formulario conservado, sin sesión | Registrar un nombre ya existente y comprobar |
| RF-3 | Cookies HttpOnly presentes y panel visible | Iniciar sesión con credenciales válidas |
| RF-4 | Mismo mensaje para cuenta inexistente y contraseña errónea | Probar ambos casos y comparar textos |
| RF-5 | Sin cookies no hay vistas privadas; con sesión solo se ven recursos propios | Borrar cookies y abrir rutas privadas; comparar con otro usuario |
| RF-6 | La operación posterior a la caducidad se completa sin pedir credenciales | Acortar la vida de la cookie de acceso y operar |
| RF-7 | Vista de acceso y retorno a la ruta solicitada tras autenticarse | Invalidar la cookie de renovación y abrir una ruta privada |
| RF-8 | Cookies de sesión ausentes, acceso visible tras recargar | Cerrar sesión y recargar |
| RF-9 | El detalle muestra todos los valores guardados | Crear y editar una red con cada campo |
| RF-10 | La previsualización coincide con capas, tamaños, activaciones y orden | Cambiar cada valor y comparar con el formulario |
| RF-11 | Violaciones visibles por campo y valores conservados | Enviar una capa, una activación o una tasa inválidas |
| RF-12 | Confirmación visible; al confirmar, estado borrador sin pesos | Editar una red entrenada |
| RF-13 | Solo redes propias con nombre, estado y tamaño | Comparar listados de dos usuarios |
| RF-14 | Confirmación antes de borrar; cancelar conserva la red | Pulsar eliminar y cancelar |
| RF-15 | Motivo visible y lista actualizada sin borrado | Intentar borrar una red entrenando y una ya borrada |
| RF-16 | Dataset listado con el tipo y contenido elegidos | Crear un dataset tabular y uno estructurado |
| RF-17 | Columnas de entrada solicitadas solo en tabular | Cambiar el tipo de origen en el formulario |
| RF-18 | Reporte con fila, columna, motivo y total; dataset ausente | Enviar contenido inválido y consultar el listado |
| RF-19 | Solo datasets propios con nombre, tipo, tamaño y filas | Comparar listados de dos usuarios |
| RF-20 | Vista previa limitada y descarga completa disponible | Abrir un dataset de más de 200 filas, comprobar el límite y descargarlo |
| RF-21 | Motivo visible y opción de reintentar, sin contenido parcial | Simular un fallo de carga del contenido |
| RF-22 | Confirmación antes de borrar; cancelar conserva el dataset | Pulsar eliminar y cancelar |
| RF-23 | Modalidad seleccionable; la corrida se crea o la corriente se abre | Entrenar en ambos modos |
| RF-24 | Motivo visible, sin curva y sin run nuevo | Lanzar con forma incompatible, tasa fuera de rango o red ocupada |
| RF-25 | Contador de época y curva actualizados con cada evento | Entrenar en vivo y comparar con los eventos recibidos |
| RF-26 | La cancelación cierra la corriente | Cancelar a mitad de una corrida en vivo |
| RF-27 | Aviso de cancelación, cero runs nuevos y estado borrador | Cancelar y consultar corridas y estado |
| RF-28 | Run con métricas visible y estado entrenada | Completar una corrida |
| RF-29 | Aviso de cancelación y opción de relanzar desde la época 1 | Cortar la conexión de red a mitad de la corriente en vivo |
| RF-30 | Motivo visible y estado final informado por la API | Forzar una divergencia con tasa alta |
| RF-31 | Estado de espera sin épocas ni curva | Lanzar one-shot y observar |
| RF-32 | Confirmación visible al salir; al confirmar, la corrida se cancela | Intentar navegar fuera y cerrar la pestaña durante el vivo |
| RF-33 | Orden reciente a antigua con métricas y dataset | Consultar una red con varias corridas |
| RF-34 | Métricas y datasets visibles lado a lado para entre dos y cuatro corridas | Seleccionar 2 y 4 corridas; intentar una quinta |
| RF-35 | Salida visible e igual a la devuelta por la API | Predecir con un vector conocido |
| RF-36 | Motivo visible y ninguna salida | Predecir con red borrador, forma errónea y valor no finito |
| RF-37 | Archivo descargado igual al volcado de la API | Descargar pesos de una red entrenada |
| RF-38 | Motivo visible y ningún archivo generado | Pedir pesos de una red borrador y forzar un fallo de descarga |

## 5. Requisitos no funcionales

> Medibles, con umbral. Las mediciones se hacen en el equipo de desarrollo del proyecto, con la API local.

- RNF-1: En la corrida de referencia de la spec 001, la curva mostrará cada época en menos de 1 s desde que la interfaz recibe su evento (p95).
- RNF-2: La previsualización de una red de 20 capas se actualizará en menos de 200 ms desde cada cambio local (p95 de 10 cambios).
- RNF-3: Las credenciales de sesión viajarán solo en cookies HttpOnly (Secure en producción y SameSite configurado); JavaScript no podrá leerlas y no aparecerán en la barra de direcciones, el contenido visible, mensajes de error, `localStorage` ni `sessionStorage`.
- RNF-4: La interfaz se usará en anchos de ventana desde 360 px hasta 1920 px sin desplazamiento horizontal de la página; las tablas podrán desplazarse dentro de su propio contenedor.
- RNF-5: Los flujos de CU-1 a CU-9 se completarán sin errores no controlados en la consola del navegador.
- RNF-6: Todos los controles serán operables por teclado, mostrarán foco visible y los campos tendrán etiqueta.

## 6. Reglas de negocio

- RN-1: La interfaz no calculará salidas, pérdidas, métricas, pesos ni series; solo mostrará lo que valide y devuelva la API (principio 3 de la constitución).
- RN-2: La interfaz consumirá los contratos de las specs 000, 001 y 002 sin alterarlos; la única ampliación es la sesión cookie-only aprobada el 14-11-2026: auth por cookie, `/csrf`, `/me`, `/refresh`, `/logout` y CSRF.
- RN-3: El usuario solo verá y operará sus propios recursos; el aislamiento lo garantiza la API.
- RN-4: La validación de la interfaz no sustituye a la de la API; ante discrepancia, prevalece la respuesta de la API.
- RN-5: Cancelar un entrenamiento en vivo consiste en cerrar la corriente de eventos; no existe una acción de cancelación distinta.
- RN-6: La curva en vivo y la selección de comparación son vistas efímeras; no se persisten ni sobreviven a una recarga.
- RN-7: Misma semilla, configuración y dataset producen las mismas métricas en ambas modalidades (heredado de las specs 001 y 002); la interfaz no altera la configuración al lanzar.
- RN-8: La semilla puede dejarse vacía para que la API genere una; la interfaz mostrará la semilla efectiva devuelta por la API.
- RN-9: Eliminar un dataset no altera las corridas existentes; la interfaz muestra los datos del dataset tal como quedaron registrados en cada corrida.
- RN-10: La interfaz mostrará el estado real informado por la API y no adelantará estados de entrenamiento ni de borrador.
- RN-11: El formulario de registro exigirá una contraseña de al menos 8 caracteres y una confirmación idéntica; si no se cumple, no enviará la solicitud.
- RN-12: La comparación admite entre dos y cuatro corridas; una quinta selección no se añade y se informa del límite.
- RN-13: Toda escritura iniciada desde el navegador (POST, PATCH, DELETE), incluidas login, registro, refresh y logout, exigirá un token CSRF válido; sin coincidencia, la API responderá 403 y no cambiará estado. Las lecturas y los clientes internos autenticados con Bearer quedan exentos.

## 7. Casos límite y errores

| Condición | Comportamiento esperado |
|-----------|-------------------------|
| La cookie de acceso caduca durante una operación privada normal | Se renueva con la cookie de renovación y la operación se repite una vez (RF-6) |
| La cookie de acceso caduca durante un entrenamiento en vivo | La corriente ya abierta continúa; la siguiente operación privada renueva la sesión. Si la renovación falla, se pide acceso al volver y se muestra el estado real: run si terminó, borrador sin run si se cortó |
| La cookie de renovación caduca o es inválida | Se trata como ausencia de sesión: acceso conservando la ruta solicitada (RF-7) |
| El navegador bloquea o no envía las cookies | No se establece sesión; se muestra un aviso claro y no se reintenta con credenciales en la URL |
| Falta el token CSRF o no coincide con la cookie | La API responde 403 sin cambiar estado; la interfaz reobtiene el token y muestra el motivo si persiste (RN-13) |
| La red está entrenando al intentar editarla, borrarla o lanzar otra corrida | Motivo visible y estado refrescado; no se modifica nada localmente (RF-15, RF-24) |
| La red o el dataset desaparecen en otra pestaña mientras se edita | Al guardar, motivo visible y retorno a la lista actualizada |
| El dataset supera tamaño, filas o estructura admitidos | Motivo visible sin guardar; si hay reporte, se muestran hasta 100 violaciones y el total (RF-18) |
| El reporte de violaciones supera 100 entradas | Se muestran las primeras 100 y el total informado |
| El contenido de un dataset supera 200 filas o 100 ejemplos | Se muestra la vista previa limitada y se ofrece la descarga completa (RF-20) |
| Una lista no tiene elementos | Estado vacío con acceso directo a la creación correspondiente |
| La contraseña del registro tiene menos de 8 caracteres o no coincide | No se envía; mensaje visible y valores conservados (RN-11) |
| La cancelación llega después del evento final | El run ya existe y la red está entrenada; no se cancela nada (coherente con la spec 002) |
| La corriente se corta antes de la primera época | Mismo aviso y relanzamiento manual de RF-29, desde la época 1 |
| El usuario intenta comparar una quinta corrida | La quinta no se añade y se informa del límite (RN-12) |
| La predicción usa una red borrador, forma incorrecta o valores no finitos | Motivo visible y ninguna salida (RF-36) |
| El volcado de pesos supera el límite admitido | Motivo visible y ningún archivo generado (RF-38) |
| El navegador se recarga durante un entrenamiento en vivo | La corriente se corta y la corrida se cancela; al volver, la vista muestra el estado real (borrador, sin run) |
| Otra pestaña guarda una edición de la misma red | Prevalece la última escritura; la interfaz no fusiona cambios y muestra lo que devuelva la API |
| El usuario intenta salir de la vista durante un entrenamiento en vivo | Se pide confirmación; si confirma, la corriente se corta y la corrida se cancela (RF-32) |
| La API devuelve un error inesperado | Motivo visible, vista conservada y posibilidad de reintentar la operación |

## 8. Fuera de alcance

- Cualquier cambio de la API o del motor distinto de la migración de sesión cookie-only aprobada; F6 consume los contratos de 000, 001 y 002.
- Revocación server-side de la credencial de renovación (blacklist), expulsión de todas las pestañas y cierre de sesiones remotas.
- Editar datasets existentes (nombre o contenido), borrar o editar corridas, y persistir curvas o comparaciones.
- Predicción por lotes, historial de predicciones, importación de redes o de pesos.
- Grafos de conexión libres o arrastre de conexiones; la topología se edita como lista con previsualización.
- Recuperación de contraseña, verificación de correo, acceso social, doble factor, perfil y borrado de cuenta.
- Compartir recursos, colaboración, roles o administración.
- Multi-idioma y modo oscuro.
- Reanudar o reconectar automáticamente un entrenamiento; notificar por correo o exportar curvas.
- Sincronización en tiempo real entre pestañas.

## 9. Supuestos y dependencias

- Supuesto-1: las specs 000, 001 y 002 están aprobadas y sus contratos permanecen estables.
- Supuesto-2: la API expone todo lo necesario para autenticación por cookie, CRUD, entrenamiento one-shot y en vivo, corridas, predicción, pesos y contenido de datasets.
- Supuesto-3: la migración de sesión cookie-only se implementa como parte de F6, con sus pruebas de API (excepción aprobada el 14-11-2026).
- Supuesto-4: la interfaz estará en español y será responsive desde 360 px hasta 1920 px de ancho.
- Supuesto-5: una recarga del navegador pierde el estado vivo del entrenamiento; no hay reanudación.
- Supuesto-6: frontend y API comparten host canónico en desarrollo (`localhost`, frontend en 3000 y API en 8000) y son del mismo sitio en producción; si no, se configura `SameSite=None` + `Secure` y el navegador debe aceptar cookies de terceros.
- Supuesto-7: el navegador acepta cookies de primera parte; si las bloquea, no hay sesión.
- Dependencia-1: spec 000 — CRUD de redes y datasets.
- Dependencia-2: spec 001 — entrenamiento one-shot, corridas, predicción y pesos.
- Dependencia-3: spec 002 — entrenamiento en vivo, curva y cancelación por desconexión.
- Dependencia-4: constitución del proyecto — fronteras numéricas y pruebas de API.

## 10. Preguntas abiertas

Ninguna. Las 6 preguntas del borrador se resolvieron el 14-11-2026 y sus respuestas están incorporadas en RF-32, RN-11, RF-20, RF-34, RNF-4 y RNF-6. La enmienda cookie-only se resolvió el 14-11-2026 con el dueño y está incorporada en RF-1..RF-8, RNF-3, RN-2, RN-13, los casos límite y los supuestos 6–7.
