# Diario

Una entrada por sesión, lo más reciente arriba. 3-6 líneas: qué se hizo, qué quedó a medias, qué toca después.

## 2026-11-25 · Dirección «Creador» (rama del agente, sin desplegar)
- Rediseño de UI con la paleta actual: títulos en Bricolage Grotesque, radios grandes, botones píldora (principal 48 px), iconos con fondo suave, estados vacíos ilustrados, `lift`/`animate-pop`. Cambiado en los componentes base (button, card, badge, input, textarea, select, tabs, dialog, dropdown) para toda la app.
- Selector de proyectos (barra lateral y cabecera móvil como hoja inferior): buscar, recientes (cookie `kreo_recent_projects`), punto de estado, Alt+1…9, «G P» y «Cambiar a X» en Ctrl+K, manteniendo la sección. Color/avatar del proyecto derivado del id.
- Botón «Crear» siempre visible (FAB central en móvil) con Publicación, IA, Clips, Agenda, Plantilla. Barra lateral: día a día arriba, resto en «Más». Contadores por aprobar/sin leer.
- Miniaturas de las publicaciones (imagen, póster o primer fotograma) en Inicio, panel y calendario, firmadas por lotes (`getPostCovers`); tira «Próximas publicaciones» 9:16.
- Toca: revisión `seguridad-legal` (cookie de preferencia nueva) y `qa-tester`; que Oier lo vea antes de fusionar.

## 2026-11-25 (rama de trabajo del agente, sin desplegar)
- **TikTok sin auditar**: modo «Enviar a mis borradores de TikTok» (API oficial inbox, scope `video.upload`), por defecto mientras `TIKTOK_DIRECT_POST_AUDITED` ≠ `true`. Estado nuevo `awaiting_user_publish` («Termínala en TikTok»), aviso en la campana y página `/posts/<id>/tiktok` con pasos, texto, hashtags, descarga del vídeo y «Ya lo he publicado». Sondeo de `status/fetch` cada 15 min (7 días).
- Si no se puede usar la API (sin el scope, 5 pendientes en 24 h, token caducado…) → «Listo para subir a mano». Direct Post rechazado por cliente sin auditar → pasa solo a borradores. Nunca «fallido» por la auditoría.
- **Content Sharing Guidelines en el editor**: `creator_info` al abrir (avatar, nickname, privacidades permitidas, interacciones en gris, duración máxima, parar si no puede publicar), divulgación comercial con los textos exactos, declaración con enlaces, consentimiento expreso, vista previa y aviso de procesado.
- Migración `20261125100000_tiktok_inbox.sql` SIN aplicar (aplicar antes de desplegar). Dosier `docs/app-review/tiktok.md` reescrito (checklist, guion del vídeo plano a plano, textos del formulario).
- Toca: Oier activa `video.upload` en la consola de TikTok y reconecta; `seguridad-legal` + `qa-tester`; prueba real.

## 2026-11-24
- Fusionados y en producción: Clipper v2, plantillas/series, avisos/mejores horas/resumen/subtítulos YT, subida directa a YouTube, inicio general y Mi agenda. 5 migraciones aplicadas.
- Revisión seguridad-legal: sin vetos; arreglos aplicados (TikTok privacidad fuera del MCP, datos de YouTube en avisos, subtítulos en borrador, update_draft_post seguro).
- Editor: un vídeo > 50 MB en «Medios» pasa solo a la subida directa a YouTube con mensaje claro.

## 2026-11-24 (rama de trabajo del agente, sin desplegar)
- **Centro de avisos**: campana con contador (barra lateral y cabecera móvil), panel, página `/app/notifications` y preferencias por tipo en Ajustes. Avisos de publicado/fallido (motivo claro), pendientes de aprobar (admins/owners, trigger en BD), cuenta caducada (redes y bandeja), permiso de YouTube que caduca (7 días «En prueba»), IA/Clipper terminada o fallida. Limpieza: leídos > 90 días. Sin email (falta dominio; punto de extensión en `src/lib/notifications/notify.ts`).
- **Mejores horas**: `bestTimes()` (patrón orientativo citado + historial propio con umbral de 12), tarjeta en Analíticas, `BestTimeHint` para el editor, MCP `get_best_times`; `get_free_slots` ordena por puntuación si hay historial. YouTube solo orientativo.
- **Resumen semanal** (lunes 8:00) como aviso con página propia + MCP `get_weekly_summary`. **Subtítulos de YouTube** con captions.insert si el vídeo tiene `.srt` (convención en `src/lib/social/captions.ts`).
- Migración `20261124120000_notifications.sql` **sin aplicar** (la aplica el dueño). Falta revisión `seguridad-legal` y `qa-tester`.
## 2026-11-24
- **Clipper v2** (sin fusionar): viralidad 0-100 desglosada (gancho, ritmo, valor, tendencia), formatos 9:16/1:1/16:9 con recorte centrado o encajado y vista previa del encuadre, 5 plantillas de subtítulos con vista previa, editar inicio/fin con la transcripción y volver a renderizar, descarga MP4 y ZIP del lote (sin marca de agua, con test), «Programar clips» en huecos libres con textos por red y `.srt` guardado por clip.
- Arreglado: doble clic en «Generar» ya no cobra dos veces (reclamo atómico antes del cobro); el ajuste de un momento fallido no se podía guardar.
- Migración `20261124100000_clipper_v2.sql` pendiente de aplicar. Seguimiento: reencuadre que sigue a la persona y título-gancho (decisiones de Oier).
## 2026-11-24
- **Inicio general** (`/app`): Hoy (agenda + salen hoy, por aprobar, fallidas, tareas, con desglose por proyecto), una tarjeta por proyecto (cuentas, seguidores y variación 7 días sin sumar YouTube, próxima publicación, pendientes), semana (agenda + publicaciones) y créditos. La lista de proyectos pasa a `/app/projects`.
- **Mi agenda** (`/app/agenda`): bloques personales puntuales o recurrentes, vista día/semana, huecos libres, «Planificar mi día/semana» (propuesta que se acepta). MCP: `get_agenda`, `add_agenda_block`, `plan_my_time`; `get_calendar` y `get_free_slots` incluyen la agenda.
- Migración `20261124130000_agenda.sql` escrita **sin aplicar**: hasta aplicarla, la agenda se ve en solo lectura con un aviso.

## 2026-11-23
- Instagram: opción «reel de prueba» en el editor (`trial_params`, MANUAL o SS_PERFORMANCE). Sin probar en real.
- Panel del proyecto rediseñado: primeros pasos, «Hoy» con cifras clicables, tarjetas por cuenta (seguidores, variación, sparkline), semana, rendimiento 30 días y créditos. Logos oficiales de las redes. Estadísticas al conectar/abrir Analíticas.
- **Inngest conectado** (PUT a `/api/inngest` → «Successfully registered»; primera llamada POST de Inngest comprobada). La publicación programada ya puede funcionar.
- Conector: interruptor «permitir gastar créditos» (apagado) + tope diario por app/clave en Ajustes › Claves API. Revisión seguridad-legal aprobada con condiciones.
- **Kreo como cerebro**: conector de Claude con OAuth 2.1 (`/api/mcp`). Desde cualquier chat de Claude: calendario,
  huecos libres, tareas, borradores de publicación e imágenes/vídeos. Migración `mcp_oauth` aplicada. Falta que Oier lo añada en claude.ai.
- Creado este cerebro (`docs/cerebro/`), cargado desde `CLAUDE.md`, con comandos `/cerebro`, `/estado` y `/pendientes`.
- App más intuitiva: menú «Crear» en la barra lateral, buscador Ctrl+K (todas las secciones y acciones), textos sin
  nombres técnicos, botones y estados vacíos más claros (panel, calendario, editor, cuentas, bandeja).
- Arreglado: el buscador perdía el foco si se abría justo al cerrar el menú «Crear».

## 2026-11-22
- TikTok conectado (el fallo era el Client secret del sandbox). YouTube conectado (faltaba la cuenta como usuario de prueba).
- YouTube en el editor: miniatura, etiquetas, categoría, listas, idioma, licencia, notificar, insertar.
- Plan interno Fundador para el workspace de Oier. Permisos sin uso retirados.
- Dosieres de revisión en `docs/app-review/`. Descubierto: YouTube ya publica en público sin auditoría.
- Pendiente: Inngest sigue sin llamar a la app.

## 2026-11-21
- Arreglada la generación de imágenes (clave secreta de Supabase mal pegada) + cola de fal.ai + reembolsos automáticos.
- Estudio rediseñado (galería + barra flotante); ordenador con ancho unificado y panel del proyecto completo.

## 2026-11-19 / 20
- Fases 2-4 completas (investigación, estrategia, bandeja, audio, clipper, Shopify, informes, MCP, equipo, planes, afiliados).
- Revisión seguridad-legal, accesibilidad HIG, paleta y navegación móvil.
- Configuradas las consolas de Google, Meta, TikTok, Microsoft, Inngest, Anthropic y ElevenLabs.

## 2026-11-18
- Fase 0 (nombre y marca) y Fase 1 (MVP: cuentas, publicación, estudio, analíticas, créditos) desplegadas.
