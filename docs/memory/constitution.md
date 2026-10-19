# Constitución — Synforja

Principios innegociables. Toda spec, plan y tarea debe cumplirlos.

1. **Stack cerrado**: Next.js 16 (App Router) + Node 22 LTS + TypeScript 5.x; Django 6.1.2 + django-ninja 1.7.1; Python 3.14.4; Pydantic 2.14.1; Rust edition 2021 con `engine-core` (PyO3 0.30.1, maturin 1.15.0, thiserror 2.0.1). Prohibido añadir dependencias o servicios sin actualizar la spec activa.
2. **La spec manda**: Ningún comportamiento se implementa si no está en la spec activa. Si falta una decisión o hay ambigüedad, se detiene el trabajo y se pregunta al usuario.
3. **Fronteras numéricas**: Next.js nunca calcula; Django solo valida, orquesta y persiste, nunca hace matemática de red; Python conecta y traduce; `engine-core` (Rust) es la única capa numérica y no conoce HTTP, DB ni modelos Django. Directorios: `backend/`, `frontend/`, `engine-core/`.
4. **Tests como puerta**: Cada tarea termina con sus tests en verde. Prohibido avanzar o dar una tarea por completada con tests en rojo.
5. **Persistencia local**: SQLite en desarrollo y Postgres en producción; pesos serializados en la DB; datasets JSON/CSV validados con Pydantic. Prohibido añadir servicios (Redis, Celery, cloud) sin que una fase lo justifique en la spec; entrenamiento síncrono con límites de red y épocas.
6. **Idioma**: Código, comentarios e identificadores en inglés; mensajes al usuario, specs y documentación en español.
