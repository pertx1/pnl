# Pendientes técnicos

Por prioridad. Claude: tacha `[x]` al terminar y anota el commit.

## Alta
- [ ] Comprobar que Inngest ejecuta `dispatch-due-posts` cuando Oier lo sincronice (registros de Vercel de `/api/inngest`).
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
- [ ] Subtítulos de YouTube (captions.insert) reutilizando los `.srt` del Clipper.
- [ ] TikTok: leer `creator_info` y ofrecer solo las privacidades permitidas.
- [ ] Probar en real: Bandeja, audio, Clipper, informes PDF.

## Usabilidad (sugerencias de la revisión del 2026-11-23)
- [ ] Barra lateral móvil cerrada: añadir `inert` para que no se pueda llegar con Tab.
- [ ] Calendario: pestañas Mes/Semana/Lista como botones con `aria-pressed`; revisar el aviso de reprogramar (mismo texto en las dos ramas).
- [ ] Panel: que las cifras sean enlaces (p. ej. «Por aprobar» → lista filtrada).
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
