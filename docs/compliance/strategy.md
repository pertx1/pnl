# Cumplimiento · Módulo de estrategia (5.12) y calentamiento guiado (5.6)

> Pendiente de revisión por el subagente `seguridad-legal` antes de cerrar el módulo. Plantilla de `docs/compliance.md`.

## Estrategia, roadmap y planificador — 2026-11-20 — Estado: ⚠️ con condiciones (pendiente de revisión)
- APIs usadas: ninguna de plataformas sociales. Anthropic Messages API (`claude-opus-5-5`, salidas estructuradas) para los agentes
  Estratega (`estratega@2026-11-20.1`, 3 créditos) y Planificador (`planificador@2026-11-20.1`, 2 créditos). Todo funciona sin IA
  (plantillas en `src/lib/strategy/templates.ts` y planificador puro en `src/lib/strategy/planner.ts`).
- Permisos / scopes: ninguno nuevo. Roles: viewer lee; editor crea/edita estrategias, hitos, tareas y crea **borradores**.
  Solo un admin puede aprobar (sin cambios: `approve_post`).
- Datos guardados (Supabase UE, RLS + `mfa_required` en todas las tablas):
  - `strategies` (texto de estrategia, pilares, frecuencia, objetivos en JSONB validado con zod), `roadmap_milestones`, `roadmap_tasks`
    (estado, responsable = miembro del workspace — lo comprueba un trigger —, fecha, `post_id`).
  - Generaciones IA en `ai_generations` (prompt = objetivo/notas del usuario; sin plazo de borrado, igual que el resto de la IA).
  - Se borran en cascada al borrar el proyecto/workspace. Sin plazo propio (datos de trabajo del cliente).
- Qué se envía a Anthropic: brand kit (tono, público, palabras prohibidas), objetivo y notas del usuario, redes del ámbito y, para el
  Estratega, un resumen de métricas propias de **TikTok/Instagram** de los últimos 30 días. **YouTube queda fuera**: sus Developer
  Policies limitan combinar/derivar métricas y compartir datos de la API con terceros. Nunca emails, tokens ni datos de terceros.
- Verificado:
  - La IA **propone**; el usuario edita todo a mano. "Pasar al calendario" y el planificador crean posts en `draft` (la política
    `posts_insert_editor` solo permite `draft`); nunca se envían a aprobación ni se programan solos.
  - El planificador muestra una **vista previa** y solo crea tras confirmación. Respeta `daily_post_limit` por cuenta contando lo ya
    existente (por día UTC, igual que `post_limit_violations`, pero contando también borradores y pendientes: más conservador),
    máx. 1 propuesta por cuenta y día si la frecuencia es ≤ 7/semana, nunca en el pasado. El servidor **revalida** límites, fechas
    y textos antes de crear.
  - Anti-baneo: nunca el mismo texto en dos cuentas distintas (comprobado en el planificador, al fusionar los textos de la IA y en
    el servidor, `duplicate_text`). Cada borrador tiene un único destino.
  - Coste en créditos visible antes de cada acción de IA, cobro atómico (`start_ai_generation`) y reembolso si falla (`refund:<id>`).
  - Prompts: prohíben comprar seguidores, grupos de engagement, follow/unfollow, contenido duplicado y promesas de resultados.
    Las propuestas del Planificador con palabras prohibidas del brand kit se descartan (queda el texto de plantilla).
  - Texto sugerido por IA y revisado por una persona: no activa la etiqueta IA (art. 50.4 AI Act; mismo criterio que el Guionista).
- Riesgos:
  - Un editor puede reasignar tareas a cualquier miembro del workspace (es el comportamiento esperado; no hay notificación).
  - Los borradores creados quedan sin opciones de TikTok (privacidad etc.): es correcto (sin valor por defecto) y se exigen al enviar.
- Pendiente: decidir plazo de conservación de prompts en `ai_generations` (común a toda la IA).

## Calentamiento guiado de cuentas — 2026-11-20 — Estado: ⚠️ con condiciones (pendiente de revisión)
- APIs usadas: ninguna de plataformas. Anthropic (agente Coach `coach@2026-11-20.1`, 2 créditos) opcional. Email (Resend vía
  `sendEmail`) solo si el usuario activa el recordatorio. Inngest: cron diario `warmup-daily-check` (08:13 Europe/Madrid).
- Permisos: viewer lee; editor crea planes, marca tareas, ajusta y activa **su propio** recordatorio (un trigger impide apuntar a
  otra persona: `reminder_user_id` solo puede ser `auth.uid()`).
- Datos guardados: `warmup_plans` (red, usuario opcional, nicho, fechas, problemas marcados, flags del aviso, `reminder_user_id`,
  `last_reminded_at`) y `warmup_tasks` (checklist, quién y cuándo la marcó). Para el email se lee el correo del usuario con la
  clave de servicio en el momento de enviar; no se copia a ninguna tabla. Inngest solo guarda IDs.
- Verificado (regla nº 1):
  - **Kreo no ejecuta ninguna acción en las plataformas**: es una checklist que el usuario hace a mano en la app oficial. Se dice en la
    página, en el email y en el prompt.
  - Las tareas recomiendan interacción genuina y en números pequeños (≤ 10/día), máx. 1 publicación al día, contenido original,
    no VPN/proxies, no cambiar de dispositivo, no comprar seguidores, etiquetar la IA, revisar el estado de la cuenta y apelar
    solo por el canal oficial.
  - Todo lo que propone el Coach pasa por `sanitizeWarmupTasks` (descarta bots, automatización, auto-follow, compra de
    seguidores/likes, follow/unfollow, pods, cuentas falsas, scraping, "masivo", usar VPN/proxy; permite las frases en negativo).
    Si no queda nada válido, se devuelve el crédito. Tests en `tests/unit/strategy-warmup.test.ts`.
  - Email de recordatorio: opt-in por usuario y plan, máx. 1 al día, solo con tareas pendientes, con enlace para desactivarlo; se
    desactiva solo al archivar el plan o 7 días después de terminar.
- Riesgos:
  - El email de recordatorio es un correo transaccional pedido por el usuario (no marketing), pero conviene que el abogado confirme
    que no requiere cabecera `List-Unsubscribe` (hoy se desactiva desde la app con un clic).
  - Las recomendaciones genéricas ("no uses VPN") son consejo de buenas prácticas, no garantía: el texto no promete resultados.
- Pendiente:
  1. Revisión por `seguridad-legal` y QA (`qa-tester`) antes del merge.
  2. Añadir el tratamiento "recordatorios de calentamiento" al RoPA (`docs/ropa.md`) si se considera finalidad distinta.
