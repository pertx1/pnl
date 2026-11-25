# Meta · Business Verification + App Review (Advanced Access)

> Verificado el **2026-11-22**. App `29288275864162154`, tipo **Empresa (Business)**, modo **desarrollo**, Facebook Login
> for Business, configuración `29290673200559330` con: `instagram_basic`, `instagram_content_publish`,
> `instagram_manage_insights`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement`,
> `pages_manage_metadata`, `business_management`. Webhook de Instagram (`messages`) en `/api/inbox/meta/webhook`.

## ⭐ Desde 2026-11-26: Instagram API with Instagram Login (por defecto)

Kreo conecta Instagram con **Business Login for Instagram** (host `graph.instagram.com`, sin página de Facebook) cuando
`INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` están configuradas. **La revisión se pide con estos permisos** (sección A); las
secciones 2-5 de más abajo quedan como referencia para la variante con Facebook Login (alternativa y Business Discovery).

### A.1 Permisos a solicitar (Advanced Access)

| Permiso | Uso en Kreo | Llamadas |
|---|---|---|
| `instagram_business_basic` | Identificar la cuenta conectada y mostrar seguidores / nº de publicaciones; requisito del refresco del token | `GET /me?fields=user_id,username,name,profile_picture_url,account_type`, `GET /me?fields=followers_count,media_count`, `GET /refresh_access_token` |
| `instagram_business_content_publish` | Publicar fotos, carruseles y reels aprobados por una persona (incl. reel de prueba) | `POST /{ig-id}/media`, `GET /{container}?fields=status_code`, `POST /{ig-id}/media_publish` |
| `instagram_business_manage_messages` | Bandeja: leer DMs que otros iniciaron, responder dentro de 24 h tras el clic «Enviar», webhook de mensajes | `GET /me/conversations?platform=instagram`, `GET /{igsid}?fields=name,username`, `POST /me/messages`, `POST/DELETE /{ig-id}/subscribed_apps` |

**No pedir** `instagram_business_manage_comments` (no se usa → motivo de rechazo). Webhook: solo el campo `messages`.

### A.2 Justificaciones (pegar en inglés)

`instagram_business_basic`
```
Kreo uses instagram_business_basic to identify the Instagram professional account the user connects with Business Login
for Instagram (user_id, username, name, profile picture, account type) and to show its followers_count and media_count in
Project > Accounts and Project > Analytics. The user_id is used to match incoming message webhooks to the right account.
It is also required to refresh the 60-day Instagram user access token before it expires. Without it Kreo cannot show
which account it publishes to.
```

`instagram_business_content_publish`
```
Kreo uses instagram_business_content_publish to publish the user's own photos, carousels and Reels (optionally as a trial
reel chosen by the user) to their own Instagram professional account, only after a workspace admin reviews and approves
the post in Kreo. At the scheduled time Kreo creates the media container(s), waits until status_code is FINISHED and calls
media_publish. If the media is AI-generated, "AI-generated content" is appended to the caption automatically. Kreo enforces
a conservative daily posting limit per account. Without this permission Kreo's core feature cannot work.
```

`instagram_business_manage_messages`
```
Kreo uses instagram_business_manage_messages to show, in Kreo's Inbox, the Instagram Direct conversations that other people
started with the user's professional account (Conversations API + messages webhook, subscribed with
/{ig-user-id}/subscribed_apps?subscribed_fields=messages when the user clicks "Turn on messages"), and to send one reply
written or approved by the user, in that same conversation, when they click "Send". Enforced in code: replies only within
the 24-hour standard messaging window (composer disabled and explained when closed); no message tags (HUMAN_AGENT only if
Meta approves that feature); no unsolicited, bulk or automated messages; recipient fixed to the conversation; max 30 replies
per hour per account; AI suggestions are drafts the user must edit/approve. Message content is deleted after 30 days.
Disconnecting unsubscribes the webhook and deletes the messages.
```

### A.3 Instrucciones para el revisor (cambios respecto a la sección 4)
- Paso 3: Accounts > Instagram > Connect → **pantalla de Instagram** (usuario de Instagram profesional de prueba) → aceptar.
  Ya no se eligen Páginas de Facebook.
- Paso 6: Inbox > Instagram > **"Turn on messages for @<account>"**: si el permiso de mensajes ya se concedió al conectar,
  se activa sin otro login; si no, vuelve a abrir la pantalla de Instagram.

### A.4 Screencasts (uno por permiso)
Plano B (concesión) = pantalla de **Business Login for Instagram** con el nombre de la app y la lista de permisos (pausa 3 s).
`instagram_business_basic` → tarjeta de la cuenta + Analytics. `instagram_business_content_publish` → igual que la fila de
`instagram_content_publish` de la sección 5. `instagram_business_manage_messages` → igual que la fila de
`instagram_manage_messages` (botón «Turn on messages», DM entrante, sugerencia, «Send», ventana de 24 h, desconectar).

### A.5 Requisitos propios de Instagram Login
- [ ] *Roles → Instagram testers*: la cuenta de prueba invitada **y aceptada** desde Instagram (modo desarrollo).
- [ ] *Business login settings*: OAuth redirect URIs `https://<DOMINIO>/api/oauth/instagram/callback` y
  `https://<DOMINIO>/api/inbox/oauth/instagram/callback`; **Deauthorize** y **Data deletion** callbacks (pendiente B4).
- [ ] Webhooks del producto Instagram: `https://<DOMINIO>/api/inbox/meta/webhook`, verify token, campo `messages`.
  Meta: "Your app must be published or Live to receive notifications for app users" → hasta pasar a Live, la Bandeja
  se apoya en la sincronización cada 30 min (Conversations API).
- [ ] Cuenta de prueba profesional con «Permitir acceso a los mensajes» (Configuración → Mensajes → Herramientas conectadas).
- Fuentes: [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login) ·
  [Content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing) ·
  [Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api) ·
  [Conversations API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/conversations-api) ·
  [Webhooks setup](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup)

## 0. Bloqueante principal: Business Verification

- Meta: "your app must complete App Review before it can request permissions with Advanced Access from any app user".
- Desde 2023 Meta pide **verificar la empresa** para Advanced Access y "individual verification will no longer be allowed"
  ([anuncio oficial](https://developers.facebook.com/blog/post/2023/02/01/developer-platform-requiring-business-verification-for-advanced-access/)).
  El formulario de App Review lo pide en el paso 1.5.
- **Oier no tiene empresa ni es autónomo → hoy no se puede obtener Advanced Access.** Opciones (💶, decisión de Oier):
  1. Alta como **autónomo** y verificar el portfolio con el nombre legal + documento oficial con nombre y dirección (para
     España, el certificado de situación censal de la AEAT es el documento habitual; **confirmar en el propio flujo de Meta**
     qué documentos lista para España antes de darse de alta). El nombre en Meta debe coincidir **exactamente** con el documento.
  2. **Sociedad** (SL): más coste y trámites, sirve también para Microsoft, Stripe y Shopify.
- *Access Verification* (Tech Provider): la doc oficial indica que "is no longer required"
  ([doc](https://developers.facebook.com/documentation/development/release/access-verification)). Si aparece en el panel
  durante la transición, completarla tras la Business Verification.
- Mientras tanto (modo desarrollo, Standard Access) todo funciona **solo con personas con rol en la app**: sirve para
  desarrollar y grabar los screencasts.

## 1. Requisitos previos (checklist)

- [ ] **Business portfolio verificado** y app vinculada a él.
- [ ] **Settings → Basic**: icono **1024×1024** sin marcas de Meta; categoría; **Privacy Policy URL**; **Terms URL**;
  **App Domains** = `<DOMINIO>`; **User data deletion**: URL de callback (preferible) o URL de instrucciones;
  email de contacto que se lea.
- [ ] **Implementar los callbacks** (hoy no existen, B4):
  - *Deauthorize callback* `https://<DOMINIO>/api/meta/deauthorize` (signed_request): marcar cuentas/tokens como revocados y borrar.
  - *Data deletion callback* `https://<DOMINIO>/api/meta/data-deletion`: borrar datos del usuario y responder
    `{ url, confirmation_code }` con una página de estado.
- [ ] **Dos configuraciones de Facebook Login for Business** (minimización; el código ya lo soporta con
  `META_INBOX_LOGIN_CONFIG_ID`):
  - *Publicación* (`META_LOGIN_CONFIG_ID`): `instagram_basic`, `instagram_content_publish`, `pages_show_list`,
    `pages_read_engagement` (+ `instagram_manage_insights` y `business_management` solo si se usan).
  - *Bandeja* (`META_INBOX_LOGIN_CONFIG_ID`): `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`,
    `pages_show_list`, `pages_read_engagement`.
  Hoy la configuración única hace que al conectar para **publicar** se pidan también los permisos de **mensajes**: un
  revisor lo verá en el screencast de `instagram_content_publish`.
- [ ] **Permisos no usados** (B6): `instagram_manage_insights` no se llama (las estadísticas usan `followers_count` y
  `media_count`, que son de `instagram_basic`). Implementar insights (`/{ig-user-id}/insights`: reach, views,
  profile views; y por media) o **no pedirlo**. `business_management`: probar si `/me/accounts` devuelve la página sin él
  cuando la página está en un portfolio; si no hace falta, no pedirlo (Meta lo rechaza con facilidad).
- [ ] **≥ 1 llamada correcta por permiso en los 30 días previos al envío** (desde la app o el Graph API Explorer).
- [ ] Recomendado (Platform Terms, seguridad): token en cabecera `Authorization` + `appsecret_proof` también en
  `src/lib/social/platforms/instagram.ts` y `publish.ts` (hoy va en la query string; la bandeja ya lo hace bien).
- [ ] Cuenta IG profesional de prueba vinculada a una Página, con "Allow access to messages" activado (README §3).
- [ ] App accesible para el revisor: login de Kreo + credenciales de prueba en el campo privado. **No** dar credenciales
  personales de Meta ("We will test your app using our own test accounts").
- [ ] Landing sin "Coming soon" en la bandeja (B8).
- [ ] **No** pasar la app a Live antes de la aprobación (motivo de rechazo listado por Meta).

## 2. Descripción de la app (pegar en inglés)

```
Kreo is a web app for content creators, small brands and agencies. A user connects their own Instagram
professional account (via Facebook Login for Business) to plan, review and publish their own posts, see their own
account statistics, and reply to Instagram Direct messages that people sent to them, all from one dashboard.

Human-in-the-loop by design: AI can draft captions and reply suggestions, but nothing is published and no message
is sent until a person reviews it and clicks "Approve" (posts) or "Send" (messages). Kreo never automates
engagement: no likes, follows, comments, story views, or unsolicited/bulk DMs. Replies are only possible in
existing conversations started by the other person, inside Instagram's 24-hour standard messaging window
(enforced server-side and explained in the UI). AI-generated media is disclosed in the caption ("AI-generated
content") automatically. Tokens are encrypted at rest; message content is deleted after 30 days; users can
disconnect at any time, which deletes their data, and we support Meta's data deletion callback.
```

## 3. Justificación por permiso (cada una distinta; pegar en inglés)

### `instagram_basic`
```
Kreo uses instagram_basic to read the connected Instagram professional account's basic profile (id, username,
name, profile picture) and its followers_count and media_count. This lets the user see which account is
connected (Project > Accounts), pick it as a destination in the post editor, and see their own follower and post
counts over time in Project > Analytics. Without it Kreo cannot identify the account it publishes to.
[Only if Competitors is live:] It is also used for Business Discovery, so the user can look up public metrics of
other public professional accounts they enter by username (Project > Competitors), showing only fields returned by
the API.
```

### `instagram_content_publish`
```
Kreo uses instagram_content_publish to publish the user's own photos, carousels and Reels to their own Instagram
professional account, only after a workspace admin reviews and approves the post in Kreo. Flow: the user creates
a post (media from their library, caption, optional AI caption suggestion that they edit), selects the Instagram
account, clicks "Approve and schedule"; at the scheduled time Kreo creates the media container(s) and calls
media_publish. If the media is AI-generated, "AI-generated content" is appended to the caption automatically.
Kreo enforces a conservative daily posting limit per account and warns about duplicate captions across accounts.
Without this permission Kreo's core feature (publishing approved content) is not possible.
```

### `instagram_manage_insights` — **solo si se implementa**
```
Kreo uses instagram_manage_insights to show the user the official insights of their own account and of the posts
they published (reach, views, profile views, likes, comments, saves) in Project > Analytics, so they can see what
works and when to post. Data is only shown to members of the user's workspace and refreshed every 6 hours.
```

### `instagram_manage_messages`
```
Kreo uses instagram_manage_messages to show, in Kreo's Inbox, the Instagram Direct conversations people started
with the user's professional account (Conversations API + messages webhook), and to send a reply written or
approved by the user, in that same conversation, when they click "Send" (Send API, messaging_type RESPONSE).
Rules enforced in code: replies only within the 24-hour standard messaging window (the composer is disabled and
explains why when the window is closed); no message tags are used (HUMAN_AGENT only if Meta approves that
feature); no unsolicited, bulk or automated messages; the recipient is fixed to the conversation; one send attempt
per click; max 30 replies per hour per account. AI suggestions are drafts the user must review. Message content
is deleted from Kreo after 30 days. Without this permission the Inbox feature cannot work.
```

### `pages_show_list`
```
Kreo uses pages_show_list to list the Facebook Pages the user manages so it can find the Instagram professional
account linked to each Page (instagram_business_account) and connect only the account the user selects. For the
Inbox it is also needed to obtain the Page access token required by the Instagram Messaging API. Kreo does not
read or publish Page content.
```

### `pages_read_engagement`
```
Kreo requests pages_read_engagement because Meta lists it as a dependency of instagram_content_publish,
instagram_manage_insights and instagram_manage_messages for Instagram accounts linked to a Facebook Page. It is
used to read the linked Instagram account and Page metadata needed to publish and to read conversations. Kreo
does not read, analyze or display the Page's own posts or engagement.
```

### `pages_manage_metadata`
```
Kreo uses pages_manage_metadata only to subscribe the user's Page to the app's webhooks (POST
/{page-id}/subscribed_apps with subscribed_fields=messages) when the user turns on the Inbox for an Instagram
account, so new Direct messages arrive in Kreo in real time; and to unsubscribe when they disconnect. Kreo does
not change any other Page setting.
```

### `business_management` — **solo si las pruebas demuestran que hace falta**
```
Kreo requests business_management only so that Facebook Login for Business returns Pages (and their linked
Instagram professional accounts) that are owned by the user's business portfolio, which /me/accounts does not
return otherwise. Kreo does not create, modify or claim any business asset, ad account or user.
```

### Feature *Human Agent* — recomendado **no** pedirlo en el primer envío
Se puede pedir más adelante. Texto si se pide:
```
Human Agent is used only when a person on the user's team replies manually to a conversation after the 24-hour
window (up to 7 days), e.g. a customer support case that needed more time. The composer shows a notice that only
human-written or human-reviewed replies are allowed; there is no automation and no promotional content.
```

## 4. Instrucciones para el revisor (pegar en inglés)

```
Kreo is a web app. Our login is email + password (not Facebook Login for Kreo itself); Facebook Login for Business
is used to connect an Instagram professional account.
1. Go to https://<DOMINIO>/login and sign in with the Kreo test account in the credentials field (2FA disabled).
2. Open the project "Demo Coffee Shop".
3. Publishing: Accounts > Instagram > Connect. Log in with your Instagram professional test account's Facebook
   user, select the Page and the Instagram account, and accept. The account appears as connected.
4. Posts > New post: select an image from the library, write a caption (optionally click "Suggest" and pick an AI
   suggestion), tick the Instagram account, leave the date empty and click "Approve". Open Calendar: within ~1
   minute the post is "Published" and visible on the Instagram account. If the image is AI-generated the caption
   ends with "AI-generated content".
5. Analytics: the account's followers and posts counts are shown.
6. Inbox: Inbox > Instagram > "Turn on DMs for @<account>" (second Facebook Login with the messaging permissions).
   Send a Direct message to the test account from another Instagram account. It appears in Kreo's Inbox within
   seconds (webhook). Open it, optionally click "Suggest reply", edit, and click "Send". The reply arrives in
   Instagram. The banner shows the remaining time of the 24-hour window; after 24 hours sending is disabled.
7. Disconnect: Inbox > Disconnect (unsubscribes the Page webhook and deletes messages) and Accounts > Disconnect
   (removes the app's permissions and deletes tokens and metrics).
```

## 5. Screencasts (uno por permiso)

Requisitos oficiales: **un vídeo por permiso o feature** ("Any requested permission or feature missing a screen recording
will not be approved"), mostrar al usuario **concediendo** el permiso y su uso, ≥ 1080p, **UI en inglés**, subtítulos/
rótulos donde no sea evidente, usar ratón, **sin audio** ("reviewers will not listen to it"). Si un permiso depende de
otro, incluir ambos en el envío. Rótulos en inglés.

**Plano común A (inicio de cada vídeo, ~20 s):** home `https://<DOMINIO>/` → login de Kreo → proyecto "Demo Coffee Shop".
**Plano común B (concesión, ~30 s):** Accounts → Instagram → Connect → diálogo de Facebook Login for Business con el
nombre "Kreo" y la lista de permisos (pausa 3 s) → elegir Página y cuenta IG → vuelta a Kreo con la cuenta conectada.
Rótulo: "User grants <permission> via Facebook Login for Business".

| Vídeo | Planos tras A+B | Rótulos clave |
|---|---|---|
| `instagram_basic` | Tarjeta de la cuenta (foto, @, nombre) → selector de cuentas del editor → Analytics (seguidores, nº de posts). [Si aplica: Competitors → buscar un @ público → datos devueltos] | "Reads the connected account's profile, followers_count and media_count" |
| `instagram_content_publish` | New post → imagen IA de la biblioteca (etiqueta IA forzada) → caption (sugerencia IA → "Use this" → editar) → marcar IG → "Approve" → Calendar "Published" → abrir Instagram y enseñar el post con "AI-generated content" al final | "Nothing is published without human approval" · "AI disclosure added automatically" |
| `instagram_manage_insights` (si aplica) | Analytics → detalle de la cuenta y del post con alcance/visualizaciones | "Official insights of the user's own account and posts" |
| `instagram_manage_messages` | Inbox → "Turn on DMs" → diálogo de permisos de mensajes → desde otra cuenta IG enviar un DM → aparece en Kreo → banner "24-hour window open…" → "Suggest reply" → editar → "Send" → el DM llega en Instagram → (corte) hilo con > 24 h: composer deshabilitado con el texto de ventana cerrada | "Replies only to conversations started by the user's customers" · "24-hour window enforced" · "Sent only when a person clicks Send" |
| `pages_show_list` | En el diálogo, lista de Páginas → elegir una → Kreo muestra solo la cuenta IG vinculada a esa Página | "Used to find the Instagram account linked to the selected Page" |
| `pages_read_engagement` | Mismo flujo de publicación (planos de `instagram_content_publish` resumidos) | "Required dependency to publish to and read the linked Instagram account" |
| `pages_manage_metadata` | Activar la bandeja → (rótulo) "Kreo subscribes the Page to the messages webhook" → DM entrante aparece en tiempo real → Disconnect → rótulo "Webhook unsubscribed" | "Only used to subscribe/unsubscribe the Page to message webhooks" |
| `business_management` (si aplica) | Conectar con una Página que está dentro de un Business portfolio → aparece; (rótulo) sin el permiso no aparecería | "Only to list Pages owned by the user's business portfolio" |

## 6. Lista de comprobación: motivos habituales de rechazo

- [ ] Falta el screencast de algún permiso, o no se ve la concesión.
- [ ] UI no en inglés, vídeo borroso, o funciones sin rótulos.
- [ ] Descripciones copiadas entre permisos o genéricas.
- [ ] Permiso pedido que no se usa (`instagram_manage_insights`, `business_management` hoy).
- [ ] Sin llamada API correcta por permiso en los últimos 30 días.
- [ ] El revisor no puede entrar (sin credenciales de Kreo o con 2FA).
- [ ] Privacidad sin explicar datos de Meta, sin instrucciones de eliminación, o callback de eliminación ausente.
- [ ] Uso fuera de "Allowed usage" (p. ej. mensajes fuera de la ventana, mensajes promocionales, automatización).
- [ ] App pasada a Live antes de la aprobación.
- [ ] Empresa sin verificar o nombre legal que no coincide con los documentos.

Fuentes: [App Review submission guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide) ·
[Instagram Platform App Review](https://developers.facebook.com/docs/instagram-platform/app-review) ·
[Screen recordings](https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings) ·
[Common mistakes](https://developers.facebook.com/docs/app-review/submission-guide/common-mistakes) ·
[Business Verification](https://developers.facebook.com/docs/development/release/business-verification) ·
[Business verification for Advanced Access (2023)](https://developers.facebook.com/blog/post/2023/02/01/developer-platform-requiring-business-verification-for-advanced-access/) ·
[Access Verification](https://developers.facebook.com/documentation/development/release/access-verification) ·
[Permissions reference](https://developers.facebook.com/docs/permissions/reference) ·
[Messenger Platform policy](https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy) ·
[Instagram Platform overview (Human Agent)](https://developers.facebook.com/documentation/instagram-platform/overview)
