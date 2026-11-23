# Pendientes técnicos

Por prioridad. Claude: tacha `[x]` al terminar y anota el commit.

## Alta
- [x] Comprobar que Inngest ejecuta `dispatch-due-posts` (2026-11-23: sincronizado con PUT; si se desincroniza tras un despliegue, repetir `curl -X PUT https://kreo-nine.vercel.app/api/inngest`) cuando Oier lo sincronice (registros de Vercel de `/api/inngest`).
- [ ] Prueba de extremo a extremo de una publicación programada en Instagram, TikTok (privado) y YouTube.
- [ ] Preparar revisiones de apps (detalle en `docs/app-review/README.md`):
  - [ ] Meta: endpoints de «desautorizar» y «eliminar datos».
  - [ ] TikTok: completar las Content Sharing Guidelines en el editor (creator_info al abrir, duración máxima, divulgación comercial, aviso de procesando).
  - [ ] Landing: quitar «lista de espera» / «próximamente» de funciones que ya existen.
  - [ ] Cuenta de prueba para revisores.
  - [ ] Separar la configuración de login de Meta en dos (publicar / bandeja).
- [ ] Mostrar en el editor los avisos `warn:` de pasos opcionales (miniatura o lista de YouTube que no se aplicaron).

## Media
- [ ] Pedir `youtube.force-ssl` solo cuando el usuario use listas (permiso incremental).
- [x] Subtítulos de YouTube (captions.insert) reutilizando los `.srt` del Clipper — 2026-11-24 (convención en `src/lib/social/captions.ts`; probar en real).
- [ ] Centro de avisos / mejores horas / resumen semanal (2026-11-24): aplicar la migración `20261124120000_notifications.sql`,
  pasar `seguridad-legal` y `qa-tester`, y comprobar en real (aviso de publicación, campana, resumen del lunes).
- [ ] Rellenar `post_metrics` (métricas por publicación de Instagram/TikTok) para que «Mejores horas» use rendimiento real
  en vez de la aproximación por seguidores. YouTube nunca (normas de su API).
- [ ] Integrar `BestTimeHint` (`src/components/analytics/best-time-hint.tsx`) en el editor de publicaciones.
- [ ] Email de avisos cuando haya dominio (punto de extensión `deliverExternal` en `src/lib/notifications/notify.ts`).
- [ ] Subtítulos de YouTube (captions.insert) reutilizando los `.srt` del Clipper: ya están en `clip_segments.srt` (por `asset_id`); helper `getClipSrtForAsset()` en `src/lib/clipper/pipeline.ts`.
- [ ] Clipper v2: revisión `seguridad-legal` + `qa-tester` (Playwright) y prueba real de un render en 1:1/16:9 y de cada plantilla (sobre todo «Mayúsculas» con Bebas Neue).
- [ ] Refactor: `get_free_slots` del MCP y `planForAccounts` del Clipper cargan los datos igual; extraer un cargador común.
- [ ] TikTok: leer `creator_info` y ofrecer solo las privacidades permitidas.
- [ ] Probar en real: Bandeja, audio, Clipper, informes PDF.

## Usabilidad (sugerencias de la revisión del 2026-11-23)
- [ ] Barra lateral móvil cerrada: añadir `inert` para que no se pueda llegar con Tab.
- [ ] Calendario: pestañas Mes/Semana/Lista como botones con `aria-pressed`; revisar el aviso de reprogramar (mismo texto en las dos ramas).
- [x] Panel: cifras como enlaces (calendario con `?status=`) — 2026-11-23.
- [ ] Revisión seguridad-legal: ¿variación 7/30 d dentro de la tarjeta de YouTube está permitida? (hoy oculta por prudencia).
- [ ] Comprobar el panel con datos reales cuando haya métricas de Akerra.
- [ ] Estudio: botón «Usar en una publicación» en cada pieza generada.
- [ ] Traducir el «Workspace» del selector y el «Close» del diálogo de shadcn.

## Baja
- [x] OAuth para el servidor MCP (conector de Claude.ai) — 2026-11-23, código hecho (migración `20261123100000_mcp_oauth.sql`).
  - [x] Migración aplicada en Supabase (2026-11-23).
  - [ ] Probar el flujo real desde claude.ai (Ajustes › Conectores › Añadir conector personalizado).
  - [x] Revisión `seguridad-legal`: aprobado con condiciones (2026-11-23).
  - [x] Interruptor «permitir gastar créditos» (apagado por defecto) + tope diario por app conectada y API key — 2026-11-23.
  - [ ] Declarar en las revisiones de Google y Meta que las métricas pueden llegar al asistente de IA del usuario (`docs/app-review/`).
  - [ ] Variable `MCP_OAUTH_RATE_SALT` propia en Vercel.
  - [x] Limpieza diaria de tokens/códigos caducados en `data-retention` (necesita Inngest).
- [ ] Gmail en un proyecto de Google Cloud aparte (para no atar la verificación de YouTube a CASA).
