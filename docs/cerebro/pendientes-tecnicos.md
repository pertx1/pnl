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

## Baja
- [ ] OAuth para el servidor MCP (conector de Claude.ai).
- [ ] Gmail en un proyecto de Google Cloud aparte (para no atar la verificación de YouTube a CASA).
