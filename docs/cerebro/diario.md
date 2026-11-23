# Diario

Una entrada por sesión, lo más reciente arriba. 3-6 líneas: qué se hizo, qué quedó a medias, qué toca después.

## 2026-11-24
- **Clipper v2** (sin fusionar): viralidad 0-100 desglosada (gancho, ritmo, valor, tendencia), formatos 9:16/1:1/16:9 con recorte centrado o encajado y vista previa del encuadre, 5 plantillas de subtítulos con vista previa, editar inicio/fin con la transcripción y volver a renderizar, descarga MP4 y ZIP del lote (sin marca de agua, con test), «Programar clips» en huecos libres con textos por red y `.srt` guardado por clip.
- Arreglado: doble clic en «Generar» ya no cobra dos veces (reclamo atómico antes del cobro); el ajuste de un momento fallido no se podía guardar.
- Migración `20261124100000_clipper_v2.sql` pendiente de aplicar. Seguimiento: reencuadre que sigue a la persona y título-gancho (decisiones de Oier).

## 2026-11-23
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
