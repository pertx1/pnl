# Google · Verificación OAuth (YouTube + Gmail) y YouTube API Services

> Verificado el **2026-11-22** en la documentación oficial. Proyecto actual: `kreo-515218`, pantalla de consentimiento
> "Kreo", estado **Testing** (máx. 100 usuarios de prueba; tokens de refresco que caducan a los 7 días en Testing).

## 0. Resumen y decisiones

| Qué | Estado | Comentario |
|---|---|---|
| Verificación de marca (branding) | Pendiente | Automática, minutos; 2-3 días hábiles si se revisa a mano. Requiere dominio verificado en Search Console |
| Verificación de scopes **sensibles** (YouTube, `gmail.send`) | Pendiente | Oficial: "can take up to 10 days" |
| Verificación de scope **restringido** (`gmail.readonly`) | Pendiente | Oficial: "several weeks" + **evaluación de seguridad CASA anual** (Google te contacta al final) 💶 |
| YouTube: subidas en público sin auditar | ✅ **Ya permitido** | Desde el 02-11-2026 "Videos uploaded through the videos.insert method from unverified API projects are no longer restricted to private viewing mode" ([revision history](https://developers.google.com/youtube/v3/revision_history)) |
| YouTube Audit & Quota Extension | No urgente | Solo si se superan 100 `videos.insert`/día, 100 `search.list`/día o 10.000 u/día del resto, o para métricas derivadas (III.L) |

**Decisión recomendada (requiere un cambio de código pequeño): separar Gmail en otro proyecto de Google Cloud.**
Todos los scopes de un proyecto se verifican juntos; con `gmail.readonly` en el mismo proyecto, la verificación de YouTube
queda atada a la de un scope restringido + CASA. Con dos proyectos ("Kreo" para YouTube, "Kreo Mail" para Gmail) YouTube
puede salir en ~10 días y Gmail cuando se decida pagar CASA. Además, `youtube.ts` usa `include_granted_scopes=true`: con el
mismo client ID, un token de YouTube podría arrastrar los permisos de Gmail que el usuario concedió antes (minimización).
Cambio necesario: variables `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` en `src/lib/inbox/providers/gmail.ts`.

**Decisión recomendada sobre `youtube.force-ssl` (cambio de código):** pedirlo **de forma incremental**, solo cuando el
usuario use listas de reproducción o subtítulos (segundo OAuth con `include_granted_scopes=true` y `scope=youtube.force-ssl`).
Hoy `youtube.ts` lo pide en la conexión inicial junto con `youtube.upload` y `youtube.readonly`, y `force-ssl` ya incluye lo
que hacen esos dos: un revisor puede preguntar por qué se piden scopes redundantes. Con petición incremental, la
justificación es limpia: la mayoría de usuarios solo concede los dos scopes estrechos.

**`yt-analytics.readonly` no se usa** (las métricas salen de `channels.list?part=statistics`). Quitarlo, o implementar
YouTube Analytics API (vistas por día, tiempo de visualización) antes de enviar. Si se envía sin uso → rechazo o
reducción de scopes.

## 1. Requisitos previos (checklist)

- [ ] **Dominio propio** (`<DOMINIO>`) apuntando a Vercel, home **sin redirecciones** a otro dominio
  ("must be static and cannot redirect to a different URL or domain"). Verificado en **Google Search Console** por un
  *Owner/Editor* del proyecto ("Verify ownership of your project's authorized domains within the Google Search Console").
  - Sobre `kreo-nine.vercel.app`: Google dice que la home "should not be hosted on a third-party platform" y que debe estar
    en "a verified domain you own". No hay una prohibición literal de `*.vercel.app`, pero hay casos públicos atascados
    ([foro](https://discuss.google.dev/t/oauth-branding-verification-stuck-home-page-url-not-registered-despite-search-console-verification-vercel-app/396107)).
    **No recomendado.**
- [ ] Home pública que describa Kreo (no solo login) y enlace a la privacidad **idéntico** al de la pantalla de consentimiento.
- [ ] Política de privacidad en el mismo dominio, **sin marcadores**, revisada por abogado, con: datos de Google que se usan
  y por qué, almacenamiento, compartición (Anthropic al pedir sugerencia), plazos, **frase de Limited Use**, enlace a la
  Política de privacidad de Google, revocación en <https://myaccount.google.com/permissions>, borrado ≤ 7 días tras
  revocar desde Kreo y ≤ 30 días si se revoca desde Google. URL **estable en inglés** recomendada (hoy el idioma depende de
  cookie/Accept-Language).
- [ ] Términos con referencia y enlace a los **YouTube Terms of Service** (Developer Policies III.A.1).
- [ ] Email de soporte del usuario y contacto del desarrollador actualizados (Google avisa por ahí; si no respondes puedes
  perder el acceso).
- [ ] Logo 120×120 px, nombre "Kreo" igual en la home, la app y el vídeo.
- [ ] Scopes declarados en *Data Access* = exactamente los que pide el código (ver §0).
- [ ] Quitar de `messages/{es,en}.json` el aviso `posts.youtube.unauditedPrivate` ("Until Google audits the app, YouTube
  keeps the video private…"): **ya no es cierto** y un revisor lo vería en el vídeo.
- [ ] Logotipo/atribución de YouTube donde se muestran sus datos (Branding Guidelines; hoy es solo texto).
- [ ] Purga de datos de YouTube si la autorización deja de ser válida (≤ 30 días) — pendiente en `docs/compliance.md`.
- [ ] Cuenta de prueba (README §3).

Consola: Branding <https://console.developers.google.com/auth/branding> · Data Access
<https://console.developers.google.com/auth/scopes> · Verification Center <https://console.developers.google.com/auth/verification>.
Hay que **publicar el branding** antes de pedir verificación de scopes ("you must have a published branding status before
you can request verification for data access").

## 2. Branding (valores para pegar)

| Campo | Valor |
|---|---|
| App name | `Kreo` |
| User support email | `support@<DOMINIO>` |
| App logo | logo 120×120 PNG |
| Application home page | `https://<DOMINIO>/` |
| Privacy policy | `https://<DOMINIO>/legal/privacidad` (o la URL inglesa estable) |
| Terms of service | `https://<DOMINIO>/legal/terminos` |
| Authorized domains | `<DOMINIO>` |
| Developer contact | email de Oier que lea a diario |

Redirect URIs (cliente web): `https://<DOMINIO>/api/oauth/youtube/callback` y (proyecto Gmail)
`https://<DOMINIO>/api/inbox/oauth/gmail/callback`.

## 3. Descripción de la app (pegar en inglés)

```
Kreo is a web app (SaaS) for content creators, small brands and agencies. It lets a user plan, review and publish
their own content to their own social accounts through each platform's official API, see official statistics of
those accounts, and manage replies to existing conversations in one inbox.

Kreo is human-in-the-loop by design: AI only drafts suggestions (captions, titles, reply drafts). Nothing is
published to YouTube and no email is sent unless a person explicitly clicks "Approve" (posts) or "Send" (replies).
Kreo never automates engagement: it does not like, comment, subscribe, rate, or send unsolicited messages.

Google data is used only to provide the user-facing features the user turns on:
- YouTube: upload the user's own approved videos to the user's own channel (with title, description, privacy,
  made-for-kids flag, the "altered or synthetic content" disclosure, thumbnail and playlist chosen by the user),
  and show the channel's own statistics as returned by the API.
- Gmail (only if the user connects it in the Inbox): show recent inbox threads (last 30 days) and send a reply,
  written or approved by the user, in an existing thread.

Google user data is never sold, never used for advertising, never used to train generalized AI/ML models and is
not read by humans except with the user's explicit consent, for security purposes, or to comply with law. Tokens
are encrypted at rest (AES-256-GCM); message content is deleted after 30 days; disconnecting revokes the token
with Google and deletes the related data.
```

## 4. Justificación de cada scope (pegar en inglés)

> Regla de Google: "You must only request the narrowest scope(s) your app needs" y explicar por qué uno menor no basta.

### `https://www.googleapis.com/auth/youtube.upload` (sensible)
```
Used to upload the user's own video to the user's own YouTube channel after the user approves the post in Kreo
(videos.insert, resumable upload) and to set the custom thumbnail the user picked (thumbnails.set).
Where in the UI: Project > Posts > post editor > "YouTube" options (title, visibility, made for kids, tags,
category, thumbnail, playlist), then "Approve and schedule". The published video link appears in the Calendar.
The "AI-generated content" switch maps to status.containsSyntheticMedia and is forced on when the post contains
AI-generated media.
Why not narrower: youtube.upload is the narrowest scope that allows videos.insert. Kreo does not request the full
"youtube" scope for uploading.
```

### `https://www.googleapis.com/auth/youtube.readonly` (sensible)
```
Used to identify the connected channel (channels.list mine=true: channel id, title, handle, thumbnail) so the user
can see which channel they are publishing to, to read the channel's own public statistics (subscriberCount,
viewCount, videoCount) shown per channel in Analytics, and to list the user's own playlists (playlists.list
mine=true) so they can choose one in the post editor.
Where in the UI: Project > Accounts (connected channel card), Project > Analytics ("By account", YouTube shown
separately and never combined with other platforms), post editor > YouTube > "Load my playlists".
Why not narrower: there is no narrower scope that returns the authenticated user's channel (mine=true). Kreo
only reads the user's own channel; it never reads other users' private data.
```

### `https://www.googleapis.com/auth/youtube.force-ssl` (sensible)
> Pegar solo las líneas de subtítulos si `captions.insert` está implementado y se ve en el vídeo el día del envío.
```
Requested incrementally, only when the user chooses to use playlists or captions for a YouTube post (users who
only publish videos never grant it).
Used to:
1) Add the newly uploaded video to the playlist the user selected (playlistItems.insert). This happens only for
   a post the user approved, and only for the playlist the user chose in the editor.
2) Upload the subtitle file the user reviewed in Kreo for that same video (captions.insert). The subtitles come
   from the user's own video (transcribed in Kreo's Clipper and edited by the user) and are uploaded only after
   the user approves the post.
Where in the UI: post editor > YouTube > "Playlist" and "Subtitles"; result visible on the published video.
Why not narrower: playlistItems.insert accepts only youtube, youtube.force-ssl or youtubepartner, and
captions.insert accepts only youtube.force-ssl or youtubepartner. youtube.upload does not allow either call.
youtubepartner is meant for YouTube content owners (CMS partners) and is broader for our use, so youtube.force-ssl
is the narrowest scope that covers both features. Kreo never uses it to delete videos, rate videos, or post,
edit or delete comments.
```

### `https://www.googleapis.com/auth/yt-analytics.readonly` (sensible) — **solo si se implementa**
```
Used to show the user's own channel analytics (views, watch time and subscribers gained per day for the user's
own channel and own videos) via the YouTube Analytics API reports.query, displayed per channel exactly as
returned, with YouTube attribution, never combined with other platforms and without derived metrics.
Where in the UI: Project > Analytics > YouTube channel detail.
Why not narrower: yt-analytics.readonly is the narrowest scope for YouTube Analytics reports; Kreo does not
request yt-analytics-monetary.readonly (no revenue data).
```

### `https://www.googleapis.com/auth/gmail.readonly` (RESTRINGIDO) — proyecto "Kreo Mail"
```
Used only when the user connects Gmail in Kreo's Inbox. Kreo lists inbox threads from the last 30 days
(users.threads.list with "in:inbox newer_than:30d -category:promotions -category:social") and reads those threads
(users.threads.get) to show them as plain text so the user can read the conversation and reply from Kreo.
Kreo only re-downloads threads whose historyId changed. Attachments are not downloaded. Message text is stored
encrypted-at-rest in the EU for at most 30 days and then deleted automatically.
Where in the UI: Project > Inbox > conversation list and conversation view.
Why not narrower: gmail.metadata does not return message bodies, which are required to show the conversation and
to quote it in a reply. gmail.addons.* scopes only work inside Gmail add-ons, not in a web app. Kreo does not
request gmail.modify: it never changes labels, read state, or deletes mail ("read" and "archived" exist only
inside Kreo).
```

### `https://www.googleapis.com/auth/gmail.send` (sensible) — proyecto "Kreo Mail"
```
Used to send one reply, in an existing thread, after the user clicks "Send" (users.messages.send with threadId,
In-Reply-To and References). The recipient is derived from the thread (Reply-To/From of the last incoming
message) and cannot be edited; no CC/BCC; replies are only allowed in threads where the other person wrote first;
max. 30 replies per hour per mailbox. There is no automatic, scheduled or bulk sending.
An optional "Suggest reply" button creates an AI draft that the user must review/edit; it is never sent
automatically.
Where in the UI: Project > Inbox > conversation > reply box > "Send".
Why not narrower: gmail.send is the narrowest scope that allows sending; Kreo does not request gmail.compose
or gmail.modify.
```

## 5. Limited Use y transferencia a IA (pegar en la privacidad y en el formulario)

Frase a incluir (en la política de privacidad y, si se puede, en la pantalla de conexión de Gmail):
```
Kreo's use and transfer to any other app of information received from Google APIs will adhere to the Google API
Services User Data Policy (https://developers.google.com/terms/api-services-user-data-policy), including the
Limited Use requirements.
```
Texto para la pregunta del formulario sobre compartición de datos:
```
Gmail content is shared with a third party only when the user explicitly clicks "Suggest reply" on a specific
conversation: the text of that conversation is sent to Anthropic (Claude API) to generate a draft reply that is
shown to the user for review. This is a prominent, user-initiated feature, disclosed in the UI and in our privacy
policy. Anthropic does not use API data to train its models by default and is bound by a data processing
agreement. Gmail data is never used to train or improve generalized AI/ML models, never sold, never used for ads.
YouTube data is never sent to AI providers.
```
> ⚠️ Antes de enviar: confirmar el DPA firmado con Anthropic y su retención (pendiente en `docs/subprocessors.md`) y que la
> UI de la bandeja muestra el aviso junto al botón "Suggest reply".

## 6. Instrucciones para el revisor (pegar en inglés)

```
1. Go to https://<DOMINIO>/login and sign in with the Kreo test account provided in the private credentials field
   (email + password; 2FA is disabled for this account).
2. Open the project "Demo Coffee Shop".
3. YouTube: left menu > Accounts > YouTube > Connect. Sign in with your Google test account and accept.
   You return to Accounts and see the connected channel with links to the YouTube Terms of Service and the
   Google Privacy Policy.
4. Left menu > Posts > New post. Write a caption, select the demo video from the library, tick the YouTube
   account, fill the YouTube title, choose Visibility (e.g. Unlisted), optionally load and choose a playlist.
   Note the "AI-generated content" switch. Click "Approve" (no date = publish now).
5. Open Calendar: after 1-2 minutes the post shows "Published" with a link to the video on YouTube.
6. Left menu > Analytics: the channel's statistics are shown per channel, separately from other platforms.
7. To disconnect: Accounts > YouTube > Disconnect. Kreo revokes the token at Google and deletes the channel data.
Gmail (only in the "Kreo Mail" project review):
8. Left menu > Inbox > Connect Gmail. Accept. Recent threads appear. Open one, click "Suggest reply" (optional),
   edit the draft and click "Send". The reply appears in the Gmail thread.
```

## 7. Guion del vídeo de demostración (YouTube)

Requisitos oficiales: subir a YouTube como **Unlisted**; mostrar el flujo completo de concesión **en inglés**; que se vea
el **nombre de la app** en la pantalla de consentimiento y el **client ID en la barra de direcciones**; demostrar la
función de cada scope sensible. Grabar a 1080p, UI de Kreo en inglés, ventana del navegador completa con la barra de
direcciones visible. Duración objetivo 3-5 min. Rótulos en pantalla (no hace falta voz; si hay voz, en inglés).

| # | Pantalla / acción | Rótulo en pantalla (EN) |
|---|---|---|
| 1 | Home `https://<DOMINIO>/` (barra de direcciones visible), bajar hasta el pie y abrir la privacidad | "Kreo – home page and privacy policy on our verified domain" |
| 2 | Login con la cuenta de prueba de Kreo; abrir proyecto "Demo Coffee Shop" | "Signed in to Kreo as a test user" |
| 3 | Accounts → tarjeta YouTube: enseñar el texto de YouTube API Services con enlaces a YouTube ToS y Google Privacy Policy | "Users agree to the YouTube Terms of Service and see the Google Privacy Policy before connecting" |
| 4 | Clic en Connect → pantalla de Google: **hacer zoom en la barra de direcciones** mostrando `client_id=…` | "OAuth consent screen – note our client ID in the address bar" |
| 5 | Elegir la cuenta de Google de prueba; pantalla de consentimiento con "Kreo" y la lista de scopes (en inglés). Pausa 3 s en la lista | "App name 'Kreo' and the exact scopes requested: youtube.upload, youtube.readonly" |
| 6 | Allow → vuelta a Accounts con el canal conectado | "Connected channel (channels.list mine=true – youtube.readonly)" |
| 7 | Posts → New post: caption, seleccionar el vídeo de la biblioteca (si es IA, se ve la etiqueta IA forzada) | "The user writes or edits the caption. AI suggestions are optional and must be reviewed" |
| 8 | Marcar la cuenta de YouTube; título, visibilidad, made for kids, categoría, miniatura | "YouTube options chosen by the user" |
| 9 | Interruptor "AI-generated content" | "Maps to status.containsSyntheticMedia (YouTube's altered or synthetic content disclosure). Forced on when media is AI-generated" |
| 10 | "Load my playlists" → si no se ha concedido `force-ssl`, aparece el aviso y botón para concederlo → segunda pantalla de consentimiento (zoom a la barra y al scope) | "Incremental authorization: youtube.force-ssl is requested only when the user wants to add the video to a playlist / upload captions" |
| 11 | Elegir lista (y subtítulos, si está implementado) | "playlists.list (readonly) / playlistItems.insert + captions.insert (force-ssl)" |
| 12 | Clic en "Approve" | "Nothing is uploaded until a human approves the post" |
| 13 | Calendar: estado → Published; clic en el enlace → vídeo en YouTube Studio en la lista elegida y con la divulgación de contenido alterado | "Uploaded with youtube.upload; added to playlist with youtube.force-ssl" |
| 14 | Analytics: estadísticas del canal por separado, con aviso de que YouTube no se combina | "Own channel statistics, shown as returned by the API, never combined with other platforms" |
| 15 | Accounts → Disconnect → confirmar; mostrar <https://myaccount.google.com/permissions> sin Kreo | "Disconnecting revokes the token at Google and deletes the channel's data from Kreo" |

### Guion del vídeo de Gmail (proyecto "Kreo Mail")

| # | Pantalla / acción | Rótulo (EN) |
|---|---|---|
| 1 | Home y privacidad (frase de Limited Use visible) | "Privacy policy with the Limited Use disclosure" |
| 2 | Kreo → Inbox → Connect Gmail | "The user chooses to connect Gmail" |
| 3 | Consentimiento: zoom en `client_id` de la barra; nombre "Kreo"; scopes `gmail.readonly` y `gmail.send` | "Exact scopes requested" |
| 4 | Lista de hilos (últimos 30 días); abrir uno; aviso de retención de 30 días | "gmail.readonly: show recent threads as plain text; content deleted after 30 days" |
| 5 | Clic en "Suggest reply" → borrador IA con la nota "AI-suggested draft… only sent when you press Send" | "Optional, user-initiated AI draft (conversation text sent to Anthropic, disclosed)" |
| 6 | El usuario edita el borrador y pulsa "Send" | "gmail.send: one reply in the same thread, recipient fixed, only after the user clicks Send" |
| 7 | En Gmail web: la respuesta aparece en el hilo | "Reply delivered in the original thread" |
| 8 | Inbox → Disconnect → confirmar | "Disconnect revokes the token and deletes threads, messages and drafts from Kreo" |

## 8. Gmail: evaluación de seguridad CASA

- Obligatoria para scopes restringidos si los datos pasan por servidores de terceros ("If you store or transmit restricted
  scope data on servers, then you need to complete a security assessment"). Kreo guarda mensajes en Supabase → **aplica**.
- La realiza un **evaluador independiente autorizado** bajo el marco CASA de la App Defense Alliance
  (<https://appdefensealliance.dev/casa>). Niveles AL1/AL2 asignados por riesgo. **Revalidación cada 12 meses**.
- Google no publica el precio: hay que pedir presupuesto a los laboratorios autorizados. 💶 **Decisión de Oier.**
- Google Trust & Safety contacta "when it is time to initiate the security assessment process" (al final de la revisión).
- Alternativa sin coste: lanzar la bandeja solo con Instagram + Outlook y dejar Gmail en "Testing" (≤ 100 usuarios de
  prueba, aviso de app no verificada, tokens de 7 días).

## 9. YouTube API Services – Audit and Quota Extension (cuando toque)

Formulario: <https://support.google.com/youtube/contact/yt_api_form>. Cuándo: cerca de 100 subidas/día en total del
proyecto, o para analíticas con métricas derivadas (Developer Policies III.L). Google puede pedir cuentas para acceder a
todas las funciones (III.H.3): usar la cuenta de prueba de Kreo. Textos base:

```
Use case: Kreo is a scheduling and publishing tool for creators and small brands. Each user connects their own
channel via OAuth and uploads their own videos after explicit approval in Kreo. We also list the user's own
playlists and add the approved video to the playlist they choose, and show the channel's own statistics.
Compliance highlights: links to YouTube ToS and Google Privacy Policy at connection time; privacy policy links to
Google's Privacy Policy and explains revocation via Google security settings; authorized data is deleted within
7 days of disconnecting in Kreo and within 30 days if access is revoked at Google; stored data is refreshed or
deleted within 30 days; YouTube data is shown per channel, never aggregated with other platforms, no derived
metrics; YouTube data is never sent to AI providers; synthetic content disclosure (containsSyntheticMedia) is
set automatically for AI-generated media.
Quota requested: videos.insert: <N>/day, other methods: <N> units/day, based on <N> active channels x <N>
uploads/day (attach screenshot of current usage from Cloud Console > Quotas).
```

## 10. Lista de comprobación: motivos habituales de rechazo

- [ ] Home o privacidad en un dominio no verificado / de terceros, o con redirección (B1).
- [ ] Enlace a la privacidad distinto en la home y en la pantalla de consentimiento.
- [ ] Privacidad sin la frase de Limited Use, sin explicar uso/almacenamiento/compartición de datos de Google, o con marcadores.
- [ ] Nombre o logo distintos entre consola, home y vídeo.
- [ ] Vídeo sin la barra de direcciones con el client ID, consentimiento no en inglés, o sin mostrar cada scope en uso.
- [ ] Scopes declarados que no se usan (`yt-analytics.readonly` hoy) o redundantes sin explicación (`force-ssl` + `upload` + `readonly`).
- [ ] Justificación genérica sin "por qué no basta uno menor".
- [ ] Transferencia a IA (Anthropic) no declarada en la privacidad ni en la UI.
- [ ] Textos de la app que contradicen la realidad (aviso "privado hasta auditoría").
- [ ] Contacto del desarrollador que no responde a los emails de Trust & Safety.

Fuentes: [Verification requirements](https://support.google.com/cloud/answer/13464321) ·
[General guidance](https://support.google.com/cloud/answer/13807376?hl=EN) ·
[Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) ·
[Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) ·
[Security assessment](https://support.google.com/cloud/answer/13465431?hl=en) ·
[User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) ·
[Workspace API user data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy) ·
[YouTube revision history](https://developers.google.com/youtube/v3/revision_history) ·
[YouTube quota & audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits) ·
[YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies) ·
[captions.insert](https://developers.google.com/youtube/v3/docs/captions/insert) ·
[playlistItems.insert](https://developers.google.com/youtube/v3/docs/playlistItems/insert) ·
[videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)
