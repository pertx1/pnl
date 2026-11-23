# TikTok · App Review + auditoría de Content Posting API (Direct Post)

> Revisado el **2026-11-25** contra la documentación oficial. App "Kreo App" (`7709972032187926548`), **sandbox**,
> productos Login Kit + Content Posting API (Direct Post activado). Scopes que pide el código:
> `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.publish`, `video.upload`. **`video.list` no se usa.**

## 0. Cómo funciona hoy y qué falta

Son **dos procesos** distintos:

1. **App Review** (sandbox → producción con sus productos y scopes). Web completa, ToS y privacidad visibles,
   **URL properties verificadas**, vídeo(s) de demo grabados en **sandbox**, explicación de cada producto y scope.
   Sin plazo oficial.
2. **Auditoría de Content Posting API (Direct Post)** (<https://developers.tiktok.com/application/content-posting-api>,
   requiere sesión). Hasta aprobarla: "All content posted by unaudited clients will be restricted to private viewing
   mode" y Direct Post da 403 `unaudited_client_can_only_post_to_private_accounts` si la **cuenta** es pública. La auditoría
   comprueba el cumplimiento de las **Content Sharing Guidelines** (§2).

**Mientras no haya auditoría** (`TIKTOK_DIRECT_POST_AUDITED` ≠ `true`), Kreo usa por defecto **«Enviar a mis borradores de
TikTok»** (Content Posting API · Upload, `POST /v2/post/publish/inbox/video/init/`, scope `video.upload`): a la hora
programada el worker sube el vídeo y TikTok manda una notificación al creador, que termina y publica en la app de TikTok
(elige texto, privacidad, etiquetas). La documentación oficial **no** limita Upload a cuentas privadas ni a clientes
auditados; sus límites son "at most 5 pending shares within any 24-hour period" y 6 peticiones/min por token. Kreo:
- marca el destino como **«Termínala en TikTok»** (`awaiting_user_publish`) y avisa en la campana con enlace a
  `/app/p/<proyecto>/posts/<post>/tiktok` (pasos, texto y hashtags para copiar, botón «Ya lo he publicado»);
- consulta `status/fetch` cada 15 min durante 7 días y lo pasa a **publicado** cuando TikTok devuelve `PUBLISH_COMPLETE`;
- si la subida a borradores no es posible (sin el scope, 5 pendientes, token caducado…), deja el destino **«Listo para
  subir a mano»** (descargar vídeo con URL firmada + copiar texto + «Ya lo he publicado»). **Nunca «fallido»** por esto.
- Direct Post sigue disponible en el editor («Publicar directamente»): si TikTok lo rechaza por cliente sin auditar,
  Kreo pasa solo a borradores (la llamada rechazada es `video/init`, antes de subir nada).

Limitación conocida de borradores: la API de inbox **no acepta título ni `is_aigc`**. El texto se copia desde Kreo y la
etiqueta «Contenido generado por IA» la activa el creador en TikTok; Kreo lo recuerda en el editor, en el aviso y en la
página de pasos. Con Direct Post (tras la auditoría) `is_aigc` vuelve a ponerse solo y no se puede quitar.

TikTok **no** exige verificación de empresa para estos productos (la "Business verification" documentada es para TikTok
Minis). Basta persona física con datos reales en los textos legales.

## 1. Lo que tiene que hacer Oier (en este orden)

1. **Consola de TikTok · Kreo Sandbox → Scopes**: marcar **`video.upload`** (ya lo pide el código) y **desmarcar `video.list`**.
   Guardar.
2. **Reconectar TikTok** en Kreo (Cuentas → desconectar y conectar) para conceder `video.upload`. Hasta entonces Kreo deja
   los vídeos «listos para subir a mano».
3. **Aplicar la migración** `supabase/migrations/20261125100000_tiktok_inbox.sql` **antes** de desplegar este código
   (las consultas por estado ya incluyen `awaiting_user_publish`).
4. En Vercel, crear `TIKTOK_DIRECT_POST_AUDITED=false` (o no crearla: equivale a `false`). Ponerla a `true` **solo**
   cuando TikTok apruebe la auditoría.
5. **Dominio propio** (💶, decisión pendiente): comprarlo y apuntarlo a Vercel **sin redirecciones** en la home, ToS y
   privacidad (las URLs con 3xx no valen para TikTok).
6. **Verificar el dominio en TikTok**: Developer Portal → app → *URL properties* (*Verify properties*) → por **dominio**
   (registro DNS TXT) o por **URL prefix** (archivo de firma servido desde `public/`). Verificar la web, la URL de
   términos y la de privacidad. Cambiar después de dominio obliga a repetir verificación y revisión.
7. **Textos legales revisados por abogado** y publicados en el dominio, en inglés en una URL estable:
   `https://<DOMINIO>/legal/terms` y `https://<DOMINIO>/legal/privacy` (públicas, sin login, sin marcadores). La
   privacidad debe nombrar los datos de TikTok que se tratan por scope y cómo revocar.
8. Actualizar en la consola: web, Terms of Service URL, Privacy Policy URL, redirect URI
   `https://<DOMINIO>/api/oauth/tiktok/callback`, **nombre de la app "Kreo"** (no "Kreo App"), icono propio.
9. Cuenta de TikTok de prueba añadida como *target user* del sandbox y **en privado** para grabar Direct Post.
10. Grabar el vídeo de demo (§5) en `https://<DOMINIO>` y enviar la App Review con los textos de §3-§4.
11. Tras pasar la App Review: enviar la **auditoría de Direct Post** (§6). Cuando la aprueben, `TIKTOK_DIRECT_POST_AUDITED=true`.

## 2. Checklist de la auditoría (Content Sharing Guidelines)

Fuente: <https://developers.tiktok.com/doc/content-sharing-guidelines>. Código: editor
`src/app/app/(shell)/p/[projectId]/posts/tiktok-options.tsx`, acción `tiktok-actions.ts → getTikTokCreatorInfo`,
lógica pura `src/lib/social/tiktok-core.ts`, worker `src/lib/social/publish.ts → deliverTikTok`.

| Punto oficial | Estado | Cómo |
|---|---|---|
| Sin marcas de agua, logos, enlaces ni texto promocional añadidos | ✅ | Kreo sube el archivo tal cual; aviso «Kreo no añade marcas de agua…» en el bloque |
| Título y hashtags editables por el usuario antes de publicar | ✅ | Texto del post o texto propio por cuenta |
| 1a Datos de `creator_info` al pintar la página; mostrar **nickname** (y avatar) | ✅ | `creator_info/query` al abrir el bloque de TikTok (acción de servidor; el token no sale del servidor); avatar + «Se publicará en la cuenta de TikTok <nickname>» |
| 1b Si el creador no puede publicar ahora, parar y avisar | ✅ | `spam_risk_too_many_posts` / `spam_risk_user_banned_from_posting` / `reached_active_user_cap` → mensaje y botón de aprobar deshabilitado |
| 1c No superar `max_video_post_duration_sec` | ✅ | Duración leída del vídeo en el navegador; aviso y botón deshabilitado si se pasa |
| 2a Título | ✅ | — |
| 2b Privacidad = `privacy_level_options`, desplegable, **sin valor por defecto** | ✅ | Solo las opciones devueltas; vacío al empezar; si la guardada ya no vale se borra |
| 2c Comentarios/Dúo/Stitch **apagados por defecto**, en gris si el creador los tiene desactivados | ✅ | Interruptores deshabilitados con «Desactivado en los ajustes de tu cuenta de TikTok» (fotos: Kreo no envía fotos a TikTok) |
| 3a Toggle de divulgación **apagado por defecto**; «Your brand» / «Branded content»; etiquetas «Promotional content» / «Paid partnership» (ambas → Paid partnership) | ✅ | Textos exactos en inglés (`messages/modules/tiktok/en.json`) y traducidos en español |
| 3a Toggle activo sin opción → publicar deshabilitado + "You need to indicate if your content promotes yourself, a third party, or both." | ✅ | Botón deshabilitado con `title` + texto visible junto al botón; el servidor también lo rechaza (`tiktok_disclosure_incomplete`) |
| 3b Branded content solo público/amigos; «Only me» deshabilitado con "Branded content visibility cannot be set to private." | ✅ | «Solo yo» y «Seguidores» deshabilitados con ese texto; si ya está «Solo yo», «Branded content» deshabilitado |
| 4 Declaración antes del botón con enlaces (Music Usage Confirmation / Branded Content Policy) | ✅ | Junto a los botones de enviar/aprobar, con enlaces a las páginas oficiales |
| 5a Vista previa del contenido | ✅ | Reproductor del vídeo en el bloque de TikTok |
| 5c Nada se envía sin **consentimiento expreso** | ✅ | Casilla de consentimiento obligatoria por cuenta (`tiktok_consent`, validada en servidor) + aprobación humana; el asistente (MCP) no puede marcarla y la borra al cambiar algo |
| 5d Aviso "it may take a few minutes for the content to process and be visible on their profile" | ✅ | Junto al botón de aprobar |
| 5e Estado de la publicación (`status/fetch` o webhooks) | ✅ | Worker + calendario; en borradores, sondeo cada 15 min |
| `is_aigc` para contenido IA | ✅ Direct Post · ⚠️ borradores | En borradores la API no lo acepta → recordatorio obligatorio en editor, aviso y página de pasos |
| Recomendado: que apruebe quien conectó la cuenta de TikTok | ❌ | Hoy puede aprobar cualquier admin del workspace (la casilla de consentimiento la marca la persona en el editor) |
| `creator_info` se vuelve a consultar justo antes de publicar | ✅ | Worker (`publishTikTok`) |

## 3. Textos para el formulario (pegar en inglés)

### App description
```
Kreo is a web app for content creators, small brands and agencies to plan, review and publish their own content
to their own social accounts through official APIs, and to see their accounts' official statistics.
Human-in-the-loop by design: AI can draft caption suggestions, but nothing is sent to TikTok until a person reviews
the post (video preview, caption, privacy, interaction settings, commercial content disclosure), ticks the explicit
consent box and clicks "Approve". Kreo never automates engagement (no likes, follows, comments, views or DMs), never
adds watermarks or promotional text to the content, and never asks for TikTok passwords. AI-generated content is
labeled with is_aigc=true when posting directly.
```

### Login Kit
```
Used so the creator can connect their own TikTok account to a Kreo project with TikTok's official OAuth
(Login Kit for Web). Kreo stores the access/refresh tokens encrypted (AES-256-GCM) on the server only, shows the
connected account (avatar, display name, username) in Project > Accounts, handles token refresh, and revokes the
token (oauth/revoke) and deletes the data when the user clicks "Disconnect".
```

### Content Posting API
```
Direct Post: publishes the creator's own approved video to their own TikTok account at the time they scheduled.
When the post editor opens, Kreo queries creator_info and shows the creator's avatar and nickname, only the privacy
options returned by TikTok (no default value), interaction toggles off by default and greyed out when disabled by
the creator, the max_video_post_duration_sec check, the "Disclose video content" toggle (Your brand / Branded
content) with TikTok's labels, the Music Usage Confirmation / Branded Content Policy declaration with links, a
video preview, an explicit consent checkbox and a notice that processing can take a few minutes. The upload
(FILE_UPLOAD) only starts after the user's explicit consent and approval; the status is tracked with status/fetch.

Upload (send to drafts): as an alternative chosen by the creator, Kreo uploads the approved video to the creator's
TikTok inbox (inbox/video/init, FILE_UPLOAD). Kreo tells the creator to open the TikTok inbox notification and
finish the post in TikTok's editing flow, shows the caption and hashtags to copy, and tracks the status with
status/fetch until PUBLISH_COMPLETE.
```

### Scopes
#### `user.info.basic`
```
Read open_id, avatar and display name to identify the connected account and show which account will receive the
post. UI: Project > Accounts card; post editor TikTok block.
```
#### `user.info.profile`
```
Read the username (@handle) so the creator can tell apart multiple connected accounts in the account selector of
the post editor, the calendar and analytics. No other profile fields are used.
```
#### `user.info.stats`
```
Read follower_count, likes_count and video_count of the creator's own account to show their own growth in
Project > Analytics (refreshed every 6 hours, own account only).
```
#### `video.publish`
```
Direct Post of the creator's own approved video to their own account (creator_info/query when the editor opens and
again right before posting, video/init with FILE_UPLOAD, status/fetch). Used only for posts approved by a human in
Kreo after ticking the consent box.
```
#### `video.upload`
```
"Send to my TikTok drafts": upload the creator's own approved video to their own TikTok inbox (inbox/video/init with
FILE_UPLOAD) so they finish and post it themselves in the TikTok app, and read its status (status/fetch) to show
"Posted" in Kreo once they publish it. Used only after the creator's explicit consent and human approval.
```

## 4. Instrucciones para el revisor (pegar en inglés)

```
Website: https://<DOMINIO>/ (Terms and Privacy links in the footer).
1. Sign in at https://<DOMINIO>/login with the Kreo test account provided (2FA disabled).
2. Open project "Demo Coffee Shop" > Accounts > TikTok > Connect, and authorize with a TikTok sandbox test user.
   The connected account (avatar, nickname, @username) appears.
3. Posts > New post: select the demo video and tick the TikTok account. The TikTok block shows the creator's avatar
   and nickname (from creator_info), a video preview and the max duration.
4. Choose "Post directly": privacy dropdown with no default (only the options returned by creator_info), interaction
   toggles off (greyed out if disabled in the creator's settings) and the "Disclose video content" toggle.
5. Tick the consent box. Next to the Approve button: the Music Usage Confirmation declaration with link and the
   "it may take a few minutes" notice. Click "Approve" (or "Approve and schedule" with a date).
6. Calendar shows the status until "Published"; the video appears on the TikTok profile.
7. Optional: choose "Send to my TikTok drafts" instead; the video arrives in the TikTok inbox and Kreo shows
   "Finish it in TikTok" with the caption to copy until the creator posts it.
8. Analytics shows the account's own follower/like/video counts.
9. Accounts > TikTok > Disconnect revokes the token.
```

## 5. Guion EXACTO del vídeo de demostración (sandbox, en inglés)

Requisitos oficiales (<https://developers.tiktok.com/doc/app-review-guidelines>): grabado en **sandbox**; "make sure the
domain of the website shown in the demo video matches the website URL you provide"; "All selected products and scopes
must be clearly demonstrated"; hasta 5 vídeos de hasta 50 MB; UI e interacciones claras.
Preparación: cuenta de TikTok de prueba **privada** y añadida al sandbox; Kreo con `TIKTOK_DIRECT_POST_AUDITED=false`;
vídeo de demo de 10-20 s sin IA y otro marcado como IA; navegador a 1080p, zoom 110 %, cursor grande, barra de direcciones
visible. Sin audio; rótulos en inglés sobreimpresos en la edición. Duración objetivo: 4-5 min, **un solo archivo**.

| # | Plano (pantalla y acción exacta) | Rótulo en pantalla (EN) |
|---|---|---|
| 1 | Abrir `https://<DOMINIO>/` en una pestaña nueva; bajar hasta el pie y señalar «Terms» y «Privacy» con el cursor | "Kreo – https://<DOMINIO>. Terms of Service and Privacy Policy visible in the footer" |
| 2 | Clic en «Log in»; escribir el email de la cuenta de prueba y la contraseña; entrar; abrir el proyecto «Demo Coffee Shop» | "Signed in to Kreo with a test user" |
| 3 | Menú del proyecto → «Accounts»; clic en «Connect» de TikTok | "Login Kit: connect the creator's own TikTok account" |
| 4 | Pantalla oficial de TikTok: mantener 3 s la lista de permisos visible (user.info.basic, user.info.profile, user.info.stats, video.publish, video.upload); iniciar sesión con la cuenta de prueba del sandbox y pulsar «Authorize» | "Official TikTok OAuth. Requested scopes: user.info.basic, user.info.profile, user.info.stats, video.publish, video.upload" |
| 5 | De vuelta en Kreo: tarjeta de TikTok con avatar, nombre y @usuario; zoom 2 s | "user.info.basic + user.info.profile: identify the connected account" |
| 6 | «Posts» → «New post»; escribir un título; pegar un texto con 2 hashtags; subir el vídeo de demo | "The creator writes and edits the caption and hashtags" |
| 7 | Marcar la cuenta de TikTok. Zoom al bloque de TikTok: avatar + «Will be posted to the TikTok account <nickname>», vista previa reproduciéndose, «Maximum duration allowed for this account: N s» | "creator_info is queried when the editor opens: avatar, nickname, max video duration. Video preview" |
| 8 | En «How it reaches TikTok» elegir **«Post directly»** | "Direct Post (video.publish)" |
| 9 | Abrir el desplegable de privacidad: se ve «Choose an option» y solo las opciones de la cuenta (en sandbox con cuenta privada: «Only me»/«Followers»); elegir una | "Privacy options come from creator_info. No default value: chosen manually" |
| 10 | Señalar los interruptores Allow comments / Allow duet / Allow stitch, todos apagados; si alguno sale en gris, mantener el cursor encima para mostrar «Turned off in your TikTok account settings»; encender «Allow comments» | "Interactions are off by default; greyed out when disabled in the creator's settings" |
| 11 | Encender «Disclose video content» sin marcar nada: el botón «Approve» queda deshabilitado y se lee "You need to indicate if your content promotes yourself, a third party, or both." | "Commercial content disclosure: publishing is disabled until an option is selected" |
| 12 | Marcar «Your brand»: aparece "Your photo/video will be labeled as 'Promotional content'"; la declaración junto al botón dice "By posting, you agree to TikTok's Music Usage Confirmation." | "Your brand → Promotional content. Music Usage Confirmation" |
| 13 | Marcar también «Branded content»: aparece "…'Paid partnership'"; abrir el desplegable de privacidad: «Only me» deshabilitado con "Branded content visibility cannot be set to private."; la declaración cambia a "…Branded Content Policy and Music Usage Confirmation." | "Branded content: cannot be private. Branded Content Policy + Music Usage Confirmation" |
| 14 | Clic en los enlaces «Music Usage Confirmation» y «Branded Content Policy» (se abren las páginas oficiales de TikTok en pestañas nuevas); volver | "Declarations link to TikTok's official pages" |
| 15 | Desmarcar «Branded content» y apagar la divulgación (vídeo no comercial); elegir de nuevo la privacidad | "Back to a non-commercial post" |
| 16 | Señalar el texto "Kreo doesn't add watermarks…" y el aviso "After posting, it may take a few minutes…" junto al botón | "No watermarks or promotional text. Processing notice" |
| 17 | Intentar aprobar sin la casilla de consentimiento → mensaje "tick the consent box"; marcar «I consent to Kreo sending this video and its caption to my TikTok account…» | "Explicit consent required before anything is sent to TikTok" |
| 18 | Clic en «Approve (no date)» | "Upload starts only after explicit consent and approval (FILE_UPLOAD)" |
| 19 | Calendario: el post pasa de «Publishing» a «Published» (recargar si hace falta) | "Publishing status tracked with status/fetch" |
| 20 | TikTok (móvil grabado o web) con la cuenta de prueba: el vídeo publicado en el perfil con la privacidad elegida | "Result: the video is on the creator's profile (private while the client is unaudited)" |
| 21 | Nueva publicación con el vídeo **IA**: el interruptor de IA queda forzado; publicar directo → en TikTok se ve «Creator labeled as AI-generated» | "AI-generated content is labeled with is_aigc=true" |
| 22 | Nueva publicación: elegir **«Send to my TikTok drafts»**; se ve el aviso del texto a copiar y del límite de 5 pendientes; marcar consentimiento; aprobar | "Upload to drafts (video.upload, inbox/video/init)" |
| 23 | Campana de avisos → «Finish your post on TikTok»; abrir la página: pasos, texto con «Copy caption», hashtags | "The creator is told to open the TikTok inbox notification and finish the post" |
| 24 | En TikTok: notificación de la bandeja → editor de TikTok → pegar el texto → publicar; volver a Kreo: estado «Published» | "The creator posts it in TikTok's own editing flow; status/fetch shows PUBLISH_COMPLETE" |
| 25 | «Analytics»: seguidores, likes y nº de vídeos de la cuenta | "user.info.stats: the creator's own account statistics" |
| 26 | «Accounts» → TikTok → «Disconnect» → confirmar | "Token revoked (oauth/revoke) and data deleted" |

## 6. Formulario de auditoría de Direct Post (tras la App Review)

URL: <https://developers.tiktok.com/application/content-posting-api>. Texto base:
```
Kreo is a publishing tool for creators and small brands. Each creator connects their own account and publishes
their own videos after explicit consent and human approval. Expected volume: <N> creators in the first 3 months,
typically 1-3 posts per creator per day (Kreo enforces a conservative daily limit per account: default 3, max 10,
and 1 post per minute per account).
UX compliance: creator_info is queried when opening the editor (avatar and nickname, privacy_level_options with no
default, interaction settings off by default and greyed out when disabled by the creator,
max_video_post_duration_sec, posting stopped if the creator cannot post now), "Disclose video content" toggle with
Your brand / Branded content and the required labels, publishing disabled until an option is selected, branded
content cannot be private, Music Usage Confirmation and Branded Content Policy declaration with links, video
preview, no watermarks, editable caption and hashtags, explicit consent checkbox before upload, processing notice
and status polling. AI-generated content is labeled with is_aigc. Kreo does not automate engagement of any kind.
Demo video: <link> (recorded in sandbox on https://<DOMINIO>).
```

## 7. Lista de comprobación: motivos habituales de rechazo

- [ ] Web en desarrollo ("waitlist", "coming soon") o que es solo landing/login.
- [ ] ToS/privacidad no visibles sin menú, rotos o con marcadores.
- [ ] URL properties sin verificar o dominio del vídeo ≠ dominio declarado.
- [ ] Productos o scopes seleccionados que no se ven en el vídeo (quitar `video.list`; `video.upload` sale en los planos 22-24).
- [ ] Nombre de app que no coincide con la marca ("Kreo App" → "Kreo").
- [x] Privacidad con valor por defecto o lista que no sale de `creator_info`.
- [x] Interacciones activadas por defecto o no deshabilitadas cuando el creador las tiene apagadas.
- [x] Falta el toggle de divulgación comercial, sus textos o los enlaces de las declaraciones.
- [x] Se sube contenido sin consentimiento expreso, o se añaden marcas de agua.
- [ ] La cuenta de prueba no está en privado (Direct Post falla con 403 mientras no haya auditoría).

Fuentes: [Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines) ·
[App Review Guidelines](https://developers.tiktok.com/doc/app-review-guidelines) ·
[Get started – Direct Post](https://developers.tiktok.com/doc/content-posting-api-get-started) ·
[Get started – Upload](https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content) ·
[Direct Post reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post) ·
[Upload reference](https://developers.tiktok.com/doc/content-posting-api-reference-upload-video) ·
[Query Creator Info](https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info) ·
[Get Post Status](https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status) ·
[Sandbox](https://developers.tiktok.com/doc/add-a-sandbox) ·
[Development configuration (URL properties)](https://developers.tiktok.com/docs/en/set-up-development-configuration)
