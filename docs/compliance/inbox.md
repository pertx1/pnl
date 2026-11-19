# Cumplimiento · Bandeja unificada, Voz y música, Clipper

Plantilla de `docs/compliance.md`. Pendiente de la revisión del subagente `seguridad-legal` y de `qa-tester` antes del merge.
Endpoints, permisos, precios y licencias verificados en la documentación oficial el **2026-11-19** (enlaces abajo).

---

## Bandeja unificada (5.11) — 2026-11-20 — Estado: ⚠️ con condiciones (pendiente de revisión)

- **APIs usadas (todas oficiales, OAuth oficial):**
  - Instagram Messaging API (Messenger Platform, variante "Instagram API con Facebook Login"):
    Conversations API `GET /{page-id}/conversations?platform=instagram`, Send API `POST /me/messages` (token de página),
    User Profile API `GET /{IGSID}?fields=name,username`, Webhooks (`messages`) con `POST /{page-id}/subscribed_apps`.
    Docs: <https://developers.facebook.com/documentation/business-messaging/instagram-messaging/get-started>,
    <https://developers.facebook.com/docs/messenger-platform/conversations>, <https://developers.facebook.com/docs/messenger-platform/webhooks>.
  - Gmail API: `users.threads.list/get`, `users.getProfile`, `users.messages.send` (con `threadId`, `In-Reply-To`, `References`).
    Google OAuth 2.0 con PKCE, `access_type=offline`, `include_granted_scopes=false`.
  - Microsoft identity platform (OAuth 2.0 + PKCE, tenant `common`) + Microsoft Graph v1.0:
    `GET /me/mailFolders/{inbox|sentitems}/messages`, `POST /me/messages/{id}/reply` (202, se guarda en Enviados).
  - Anthropic (agente Community manager, `community@2026-11-20.1`) para BORRADORES de respuesta.
- **Permisos / scopes (mínimos):**
  - Meta: `instagram_basic`, `instagram_manage_messages` (leer/responder DMs), `pages_manage_metadata` (suscribir la página al
    webhook), `pages_show_list` (obtener el token de la página vinculada). Se piden en un OAuth **aparte** del de publicación y
    solo cuando el usuario activa la bandeja de una cuenta IG ya conectada en "Cuentas". Se guarda **solo el token de página**.
    Función **Human Agent**: solo se usa si Meta la aprueba en App Review y se activa `META_HUMAN_AGENT_ENABLED=true`.
    Puede que `business_management` sea necesario si la página está en un Business Manager: añadirlo solo si App Review lo exige.
  - Google: `gmail.readonly` (**restringido**) y `gmail.send` (**sensible**). No pedimos `gmail.modify` (no tocamos el buzón:
    "leído" y "archivado" son solo estados en Kreo).
  - Microsoft: `Mail.Read`, `Mail.Send`, `offline_access`; `openid email` solo para mostrar qué buzón se conectó (claim del
    id_token, sin llamar a `/me`).
- **Reglas de producto (regla nº 1):**
  - La IA **propone**; el texto queda como borrador editable (`inbox_drafts`) y **solo se envía al pulsar "Enviar"**. No hay
    envío automático ni programado.
  - Solo se responde a **hilos existentes** donde la otra persona ha escrito (`last_inbound_at` obligatorio). El destinatario
    se deriva del hilo (Reply-To/From del último mensaje entrante; IGSID en Instagram) y **no es editable**: no se puede
    escribir en frío ni a terceros. Sin CC/BCC. Freno anti-abuso: máx. 30 respuestas/hora por conexión.
  - Instagram: **ventana de 24 h** respetada en servidor y en UI (envío deshabilitado y explicado). Fuera de ella solo la
    etiqueta `HUMAN_AGENT` (≤ 7 días) si está aprobada. No se usan otras etiquetas de mensaje.
  - TikTok: no hay API pública de DMs → tarjeta "Próximamente", sin hacks.
  - Envíos con **un único intento** (sin reintentos automáticos que dupliquen mensajes).
- **Datos guardados (qué, dónde, cuánto tiempo):** Supabase (UE, Frankfurt).
  - `inbox_connections`: canal, id de la cuenta IG o dirección de email del buzón, scopes, estado. Hasta desconectar.
  - `inbox_connection_tokens`: tokens **cifrados AES-256-GCM** (`encryptToken`), RLS sin políticas (solo `service_role`).
    Gmail/Outlook: access + refresh; Instagram: token de página. Hasta desconectar.
  - `inbox_threads`: metadatos (asunto, nombre/@ o email de la contraparte, fechas, estado, extracto ≤ 140 caracteres).
    Se borran a los **30 días** sin actividad.
  - `inbox_messages`: texto plano de los mensajes de los **últimos 30 días** (HTML convertido a texto, citas eliminadas,
    máx. 8.000 caracteres), `expires_at = fecha del mensaje + 30 días`, purga diaria (`inbox-retention`, Inngest).
    No se descargan adjuntos (solo se anota el tipo, p. ej. `[image]`).
  - `inbox_drafts`: borradores, se borran al enviar o a los 30 días.
  - `ai_generations` de las sugerencias: **sin contenido de mensajes** (solo la etiqueta `community.reply <versión>`).
  - Logs: solo códigos de error, nunca contenido ni direcciones. Eventos de Inngest: solo IDs.
- **Seguridad:**
  - Webhook: firma `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo con el App Secret, comparación en tiempo constante)
    y verify token en la suscripción. Inserción idempotente (único por hilo + id de mensaje) frente a reenvíos de Meta.
  - OAuth: estado firmado (HMAC) en cookie httpOnly de 10 min + PKCE (Google y Microsoft); rol **editor** comprobado con la
    sesión antes de iniciar y al volver. Llamadas a Graph de Meta con cabecera `Authorization` + `appsecret_proof` (token
    nunca en la URL).
  - RLS en todas las tablas + `mfa_required`. Lectura: miembros (viewer); cambiar estado/borradores: editor; desconectar: admin.
    Trigger `guard_inbox_thread_update`: un usuario solo puede cambiar `status`/`unread` de un hilo, nunca su contenido.
    El contenido solo lo escribe el servidor (`service_role`) tras comprobar permisos con la sesión.
  - Los mensajes se muestran como **texto plano** (nunca se renderiza HTML del remitente).
  - Desconectar: Google → `oauth2.googleapis.com/revoke`; Meta → baja del webhook de la página (si ningún otro proyecto la usa;
    **no** se retiran los permisos de la app porque los comparte el módulo de publicación); Microsoft → no hay revocación de un
    refresh token delegado concreto: se borra y la UI indica dónde retirar el permiso (account.microsoft.com / admin de M365).
    En todos los casos se borran en cascada tokens, hilos, mensajes y borradores.
- **Google — Limited Use y verificación (CASA):**
  - `gmail.readonly` es **restringido**: exige verificación OAuth de Google **y evaluación de seguridad anual (CASA,
    App Defense Alliance)** porque Kreo almacena/transmite datos de Gmail en sus servidores. `gmail.send` es sensible
    (verificación sin CASA). Hasta aprobarlo: app en modo "Testing" (máx. 100 usuarios de prueba, aviso de app no verificada).
  - Cumplimiento de la **Google API Services User Data Policy – Limited Use** (texto ya incluido en la política de privacidad):
    los datos de Gmail solo se usan para mostrar/responder conversaciones a petición del usuario; no se venden, no se usan para
    publicidad ni para entrenar modelos generales; ningún humano los lee salvo consentimiento expreso, seguridad o ley.
    Enviar el texto de un hilo a Anthropic para sugerir una respuesta es una función **visible y pedida por el usuario** (botón
    "Sugerir respuesta", con coste) → permitido como "transferencia para proporcionar la función"; Anthropic no entrena con
    datos de la API por defecto. **Debe declararse** en la verificación y en la política de privacidad.
  - Vídeo de demostración para Google: conexión, lectura de un hilo, borrador IA editado y envío manual.
- **Microsoft:** `Mail.Read`/`Mail.Send` delegados no requieren consentimiento de administrador por defecto, pero muchos tenants
  lo exigen por política. Recomendado: **Publisher verification** (MPN) para evitar el aviso "no verificado" y bloqueos de
  consentimiento en tenants de empresa. App multi-tenant + cuentas personales (`common`).
- **Meta:** App Review de `instagram_manage_messages`, `pages_manage_metadata` y (opcional) Human Agent, con screencast.
  Requisitos: empresa verificada, cuenta IG profesional con "Permitir acceso a los mensajes" activado. Con acceso estándar solo
  se puede escribir a personas con rol en la app. Límite de la Conversations API: solo los 20 últimos mensajes de cada
  conversación tienen detalle. Políticas de Messenger Platform: <https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy>.
- **Riesgos:**
  1. Roles RGPD: Kreo actúa como **encargado** de los mensajes de los clientes de sus usuarios → DPA con clientes (art. 28) y
     EIPD recomendada (IA + mensajería). Base legal del usuario frente a sus propios clientes.
  2. Transferencia a Anthropic (EE. UU.) del texto de la conversación al pedir sugerencia → listar como subencargado con SCC.
  3. CASA tiene coste anual (evaluador externo) → **decisión de Oier** antes de abrir Gmail a usuarios reales.
  4. Outlook: la respuesta enviada se guarda primero como copia provisional (Graph no devuelve id) y la sincronización trae la real;
     la UI oculta el duplicado.
- **Pendiente:** App Review de Meta; verificación de Google (restringido) + CASA; Publisher verification de Microsoft; añadir las
  variables a `.env.example` (no estaba en mi lista de archivos); revisar textos con abogado; enlazar la URL de instrucciones de
  eliminación de datos de Meta.

## Voz y música (5.3) — 2026-11-20 — Estado: ⚠️ con condiciones

- **APIs usadas:** ElevenLabs API oficial: `GET /v2/voices?voice_type=default`, `POST /v1/text-to-speech/{voice_id}`
  (`eleven_multilingual_v2`, `eleven_flash_v2_5`), `POST /v1/music` (`music_v2_5`, `sign_with_c2pa: true`).
- **Precios (pricing/api, 2026-11-19):** v2 Multilingual 0,08 $/1K caracteres; Flash 0,04 $/1K; música 0,15 $/min →
  créditos = ⌈coste × 100⌉ (mín. 1). Se muestran antes; cobro atómico; reembolso si falla.
- **Licencia:** uso comercial solo con **plan de pago** de ElevenLabs (el plan gratis exige atribución y no es comercial).
  Música (Eleven Music terms): uso comercial online/offline en planes de pago **excepto cine, TV, radio y videojuegos de estudio**
  (Enterprise). Se guarda en `ai_generations.license` y se muestra en la UI.
- **Datos:** al proveedor solo va el texto/descripción. MP3 en `project-media` (privado) como asset `ai_generated = true`
  (no desactivable). Solo voces por defecto de la biblioteca (sin clonación → sin riesgo de suplantar voces reales).
- **AI Act art. 50:** la música lleva firma C2PA (marca legible por máquina). La voz (TTS) **no** la lleva: valorar marca de agua
  o metadatos ID3 con el abogado. Etiqueta "Generado con IA" en la biblioteca.
- **Riesgos / pendiente:** confirmar plan de pago de Kreo en ElevenLabs y DPA/retención (plan no Enterprise → `enable_logging`
  no se puede desactivar); el editor de posts de otro módulo podría mostrar los audios como imagen (ver informe).

## Clipper (5.4) — 2026-11-20 — Estado: ⚠️ con condiciones

- **APIs usadas (fal.ai, todas con etiqueta "Commercial use", verificado en fal.ai/models):**
  `fal-ai/whisper` (transcripción con tiempos por segmento), `fal-ai/workflow-utilities/trim-video` (0,001 $/s de cómputo),
  `fal-ai/workflow-utilities/scale-video` (`mode: crop` 1080×1920; 0,001 $/s), `fal-ai/workflow-utilities/auto-subtitle`
  (0,03 $/min; subtítulos karaoke quemados, colores con nombre, fuente de Google Fonts). Claude (`clipper@2026-11-20.1`) para
  elegir momentos.
- **Por qué fal y no ffmpeg.wasm:** ffmpeg.wasm en el navegador con vídeos de hasta 50 MB y re-codificación H.264 + subtítulos
  quemados es lento (minutos), consume mucha memoria y falla en móviles; además exige cabeceras COOP/COEP en toda la app. Los
  endpoints de fal son oficiales, asíncronos (cola) y siguen el mismo patrón que el Estudio. Alternativa siempre disponible:
  `.srt` por momento y del vídeo completo (generado en el navegador a partir de la transcripción).
- **Reglas:** solo vídeo **propio o con derechos** (casilla obligatoria, `rights_confirmed_at`); YouTube: la API oficial no
  permite descargar → "Próximamente / sube el archivo". Los shorts se guardan como assets **no** sintéticos
  (`ai_generated = false`: es tu vídeo recortado y subtitulado con tu propia voz transcrita).
- **Datos:** vídeo original y shorts en `project-media` (privado); transcripción en `clip_jobs.transcript` hasta que el usuario
  borre el análisis. A fal se envía una **URL firmada de 6 h** del vídeo; los intermedios quedan en el CDN de fal (URLs no
  adivinables) según su política de retención → **verificar plazo y DPA de fal**.
- **Riesgos:** recorte centrado fijo (si la persona no está centrada, se corta); Whisper puede fallar con música alta o varios
  idiomas; la duración se declara en el navegador (si el vídeo real es > 15 % más largo, el trabajo se detiene y se reembolsa);
  colores de marca aproximados a 13 colores con nombre (limitación del endpoint).
