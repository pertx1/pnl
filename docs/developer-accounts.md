# Cuentas de desarrollador y revisiones de API

> Empieza YA: varias revisiones tardan semanas. Todo lo marcado con 💶 cuesta dinero (te lo pregunto antes).
> Los nombres de permisos cambian a menudo: antes de enviar cada revisión, `integraciones-rrss` los verifica
> contra la documentación oficial vigente.
>
> Para casi todas las revisiones necesitarás: **dominio propio, política de privacidad y términos publicados,
> email de soporte, logo, vídeo demo (screencast) del flujo OAuth y de cada permiso en uso**. Los textos y
> guiones de vídeo te los preparo yo cuando cada módulo esté listo.

## Requisitos previos comunes
- [ ] Dominio definitivo (tras la Fase 0) 💶
- [ ] Sociedad o autónomo con datos fiscales (Meta Business Verification, Stripe, Shopify Partner y Google los piden)
- [ ] Email corporativo (soporte@, privacidad@, legal@)
- [ ] Landing + páginas legales publicadas (Fase 1) — las revisiones las comprueban

---

## 1. Meta (Instagram + Ad Library) — https://developers.facebook.com
- [ ] Cuenta de Meta for Developers + **Meta Business portfolio** con **Business Verification** (documentos de empresa)
- [ ] App de tipo **Business**
- [ ] Producto por defecto (desde 2026-11-26): **Instagram API with Instagram Login** (Business Login for Instagram,
  host `graph.instagram.com`, sin página de Facebook). Variables `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`.
- [ ] **App Review → Advanced Access** para (Instagram Login):

| Permiso | Para qué | Fase |
|---|---|---|
| `instagram_business_basic` | Perfil de la cuenta profesional conectada (`/me`: user_id, @, nombre, foto, seguidores, nº de publicaciones) y requisito del refresco del token | 1 |
| `instagram_business_content_publish` | Publicar posts/reels/carruseles aprobados (`/media`, `/media_publish`, reel de prueba con `trial_params`) | 1 |
| `instagram_business_manage_messages` | Bandeja: leer conversaciones (`/me/conversations`), responder dentro de la ventana de 24 h (`/me/messages`) y suscribir la cuenta al webhook `messages` (`/{ig-id}/subscribed_apps`) | 3 |
| ~~`instagram_business_manage_comments`~~ | No se pide con Instagram Login: los comentarios van por Unified Login (`instagram_manage_comments`, ver «Actualización 2026-11-26») | — |

- Alternativa (solo si no hay `INSTAGRAM_APP_ID`; también la usan las cuentas ya conectadas así hasta que se reconecten):
  **Instagram API con Facebook Login** (necesaria para Business Discovery = análisis de competencia). **App Review → Advanced Access** para:

| Permiso | Para qué | Fase |
|---|---|---|
| `instagram_basic` | Leer perfil y media de la cuenta conectada; Business Discovery de competidores | 1 |
| `instagram_content_publish` | Publicar posts/reels/carruseles programados | 1 |
| `instagram_manage_insights` | Estadísticas de la cuenta y de los posts | 1 |
| `pages_show_list` | Listar las páginas para encontrar la cuenta IG vinculada | 1 |
| `pages_read_engagement` | Requisito de Meta para leer la cuenta IG vinculada a la página | 1 |
| `business_management` | Solo si la cuenta IG está en un Business portfolio (se valida en pruebas; si no hace falta, no se pide) | 1 |
| `instagram_manage_messages` | Bandeja unificada (DMs, ventana 24 h) | 3 |

- [ ] **Ad Library API**: confirmación de identidad del desarrollador (facebook.com/ID) y aceptar sus términos.
  Uso: anuncios comerciales disponibles para la UE (transparencia DSA). Fase 2.
- Plazo típico de App Review: 1-4 semanas (pueden rechazar y hay que reenviar).

## 2. TikTok — https://developers.tiktok.com
- [ ] Cuenta de TikTok for Developers + organización + app (web)
- [ ] Productos: **Login Kit**, **Content Posting API**
- [ ] Scopes:

| Scope | Para qué | Fase |
|---|---|---|
| `user.info.basic` | Identificar la cuenta conectada (avatar, nombre) | 1 |
| `user.info.profile` | Datos de perfil (bio, verificado, enlace) | 1 |
| `user.info.stats` | Seguidores, likes totales, nº de vídeos | 1 |
| `video.list` | ~~Listar vídeos propios~~ **No se pide** (no se usa; quitarlo de la consola) | — |
| `video.publish` | Direct Post (publicar a la hora programada) y `creator_info/query` al abrir el editor | 1 |
| `video.upload` | **Enviar a mis borradores de TikTok** (`inbox/video/init`): modo por defecto mientras no haya auditoría; el creador termina y publica en la app de TikTok. También `status/fetch` para saber si ya lo publicó | 1 |

- [ ] **Auditoría de Content Posting API (Direct Post)**: hasta aprobarla, todo lo publicado es **privado**
  (solo visible para el creador). Exigen cumplir sus *UX guidelines*: mostrar el nombre de la cuenta, elegir
  privacidad sin valor por defecto, toggles de comentarios/duet/stitch, declaración de contenido comercial,
  aviso de Music Usage Confirmation y vista previa. Lo diseñaremos así desde el día 1.
- **DMs de TikTok**: no hay API pública → "Próximamente".
- **Research API**: solo para investigación académica sin ánimo de lucro → **no la usamos**.
  Stats de perfiles ajenos de TikTok = proveedor externo de datos públicos (Fase 2, 💶, aviso "datos estimados").

## 3. Google (YouTube + Gmail) — https://console.cloud.google.com
- [ ] Proyecto de Google Cloud + **pantalla de consentimiento OAuth** (tipo External) + verificación de dominio en Search Console
- [ ] APIs: YouTube Data API v3, YouTube Analytics API, Gmail API

| Scope | Tipo | Para qué | Fase |
|---|---|---|---|
| `https://www.googleapis.com/auth/youtube.upload` | Sensible | Subir vídeos/Shorts programados | 1 |
| `https://www.googleapis.com/auth/youtube.readonly` | Sensible | Leer canal y vídeos propios | 1 |
| `https://www.googleapis.com/auth/yt-analytics.readonly` | Sensible | Estadísticas del canal | 1 |
| `https://www.googleapis.com/auth/gmail.readonly` | **Restringido** | Leer hilos para la bandeja | 3 |
| `https://www.googleapis.com/auth/gmail.send` | Sensible | Enviar respuestas aprobadas | 3 |

- [ ] **Verificación de app OAuth** (scopes sensibles): 2-6 semanas.
- [ ] **YouTube API Services – Audit & Quota Extension**: cuota por defecto 10.000 unidades/día por proyecto;
  cada subida consume una parte importante → hay que pedir ampliación (requiere auditoría de cumplimiento de
  los YouTube API Services Terms). Análisis de competencia (canales públicos) usa API key, sin OAuth.
- [ ] ⚠️ 💶 **Gmail (scope restringido) exige evaluación de seguridad CASA** por un laboratorio autorizado,
  **anual y de pago** (orientativamente desde unos cientos hasta varios miles de € según nivel). Lo decidiremos
  al llegar a la Fase 3 (alternativa: empezar solo con Outlook o con reenvío de correo).
- [ ] Cumplir **Google API Services User Data Policy (Limited Use)**: declaración en la política de privacidad.

## 4. Microsoft (Outlook) — https://entra.microsoft.com
- [ ] Registro de app en **Microsoft Entra ID** (multi-tenant + cuentas personales Microsoft)
- [ ] **Publisher verification** (requiere cuenta en Microsoft AI Cloud Partner Program, gratuita) para no
  salir como "editor no verificado"
- [ ] Permisos delegados de Microsoft Graph: `openid`, `email`, `profile`, `offline_access`, `User.Read`,
  `Mail.Read` (leer hilos), `Mail.Send` (enviar respuestas aprobadas). Fase 3.

## 5. Shopify — https://partners.shopify.com
- [ ] Cuenta de **Shopify Partner** + app pública (distribución en App Store o "unlisted")
- [ ] Scopes: `read_products`, `read_orders` (+ `read_all_orders` si queremos > 60 días, requiere solicitud),
  `read_discounts`, `write_discounts` (crear códigos por contenido/creador), `read_analytics`. Fase 4.
- [ ] **Protected customer data**: los pedidos contienen datos de clientes → solicitar acceso de nivel 1 y
  no pedir campos de nivel 2 (nombre, email, dirección) salvo necesidad real.
- [ ] Webhooks RGPD obligatorios: `customers/data_request`, `customers/redact`, `shop/redact`.
- [ ] Revisión de App Store (si se lista públicamente): 1-4 semanas.

## URLs de redirección OAuth (para configurar en cada app de desarrollador)
Sustituye `<dominio>` por tu dominio (o `kreo-nine.vercel.app` para pruebas):
- TikTok: `https://<dominio>/api/oauth/tiktok/callback`
- Instagram (Instagram Login y Facebook Login): `https://<dominio>/api/oauth/instagram/callback` y `https://<dominio>/api/inbox/oauth/instagram/callback`
- Google: `https://<dominio>/api/oauth/youtube/callback`

## 6. Pagos y otros (cuando toque; todos 💶 por uso)
- [ ] **Stripe** (cuenta con datos de empresa) + **Stripe Tax** (registro OSS de IVA en la AEAT) — necesario para vender créditos
  - Developers → API keys → `STRIPE_SECRET_KEY`
  - Developers → Webhooks → endpoint `https://<dominio>/api/stripe/webhook` con los eventos
    `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
    `checkout.session.expired` → `STRIPE_WEBHOOK_SECRET`
  - Settings → Tax: activar Stripe Tax y luego `STRIPE_TAX_ENABLED=true`
- [ ] Afiliados: Stripe Connect o herramienta tipo Rewardful/Tolt (lo propongo en Fase 4)
- [x] **Supabase** (proyecto `kreo`, Frankfurt) y **Vercel** (proyecto `kreo`) — creados
- [ ] **Supabase**: copiar la *secret key* (Project Settings → API Keys) a Vercel como `SUPABASE_SECRET_KEY` (sensitive)
- [ ] **Supabase Auth → URL Configuration**: Site URL + Redirect URLs (`/auth/callback`)
- [ ] **Inngest** (plan gratuito): crear cuenta, conectar la integración de Vercel → añade `INNGEST_EVENT_KEY` y `INNGEST_SIGNING_KEY`
- [ ] Proveedores de IA con licencia comercial: fal.ai / Replicate (imagen y vídeo), ElevenLabs (voz y música),
  proveedor de texto (Claude) — Fase 1/3. Firmar DPA con cada uno.
- [ ] Proveedor de email transaccional con región UE — Fase 1
- [ ] Proveedor de datos públicos de TikTok (con declaración de cumplimiento legal) — Fase 2

## Dominio de producción y URLs registradas (2026-11-19)
- **Dominio público: `https://kreo-nine.vercel.app`** (`NEXT_PUBLIC_APP_URL`). `kreo-mnysoon-1995.vercel.app` es un alias del
  equipo protegido por Vercel Authentication (responde 302 al login de Vercel): NO sirve para OAuth ni webhooks.
- Las URIs de redirección se construyen en código con `appUrl()` (src/lib/env.ts) + la ruta:
  - Google: `/api/oauth/youtube/callback`, `/api/inbox/oauth/gmail/callback`
  - Meta: `/api/oauth/instagram/callback`, `/api/inbox/oauth/instagram/callback`; webhook `/api/inbox/meta/webhook` (objeto Instagram, campo `messages`)
  - TikTok: `/api/oauth/tiktok/callback`
  - Microsoft: `/api/inbox/oauth/outlook/callback`
  - Shopify: `/api/shopify/callback` (+ `/api/shopify/install`, `/api/shopify/webhooks`)
- Meta (app tipo Empresa → Facebook Login for Business): crear una "configuración" con instagram_basic, instagram_content_publish,
  instagram_manage_insights, instagram_manage_messages, pages_show_list, pages_read_engagement, pages_manage_metadata y
  business_management, y poner su ID en `META_LOGIN_CONFIG_ID`. Sin esa variable se piden los permisos por `scope`.
- TikTok, verificación de URL por archivo: el archivo que da TikTok se sirve desde `public/` (p. ej. `public/tiktokXXXX.txt`).

## Actualización 2026-11-22 (permisos mínimos y YouTube)
- Retirados del código por no usarse (motivo directo de rechazo en las revisiones): `yt-analytics.readonly` (Google),
  `video.list` y `video.upload` (TikTok), `instagram_manage_insights` (Meta). Desmárcalos también en cada consola
  (scopes del sandbox de TikTok, configuración de Facebook Login for Business y pantalla de consentimiento de Google).
- YouTube: desde el 2026-11-02 los vídeos subidos desde proyectos sin auditar YA NO quedan en privado
  (https://developers.google.com/youtube/v3/revision_history). La auditoría solo hace falta para ampliar cuota.
- Dosieres de revisión de las apps: `docs/app-review/`.

## Actualización 2026-11-25 (TikTok sin auditar: borradores)
- Vuelve `video.upload` (TikTok): el código lo pide de nuevo para «Enviar a mis borradores de TikTok»
  (Content Posting API · Upload, `POST /v2/post/publish/inbox/video/init/`). Justificación: sin la auditoría de Direct Post,
  TikTok solo deja publicar en cuentas privadas; la subida a borradores no tiene esa restricción documentada y la
  publicación la hace el creador en la app de TikTok. Límite oficial: 5 envíos pendientes cada 24 h.
- Hay que **marcar `video.upload` en la consola de TikTok** (Kreo Sandbox → Scopes) y **reconectar** cada cuenta de TikTok.
  Hasta reconectar, Kreo deja el destino «listo para subir a mano» (nunca «fallido»).
- Variable nueva `TIKTOK_DIRECT_POST_AUDITED` (solo `true` cuando TikTok apruebe la auditoría).

## Actualización 2026-11-26 (Instagram API with Instagram Login)
- Instagram pasa por defecto a **Instagram API with Instagram Login** (publicar + mensajes, sin página de Facebook). Se activa
  poniendo `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` (los de *Instagram → API setup with Instagram login → Business login
  settings*, no los de Configuración → Básica). Sin ellas, sigue Facebook Login for Business como hasta ahora.
- Verificado en la documentación oficial (2026-11-26):
  - Autorización `https://www.instagram.com/oauth/authorize` (client_id, redirect_uri, response_type=code, scope, state);
    `POST https://api.instagram.com/oauth/access_token` (grant_type=authorization_code; respuesta con `permissions`);
    token largo `GET https://graph.instagram.com/access_token` (grant_type=ig_exchange_token, "valid for 60 days");
    refresco `GET https://graph.instagram.com/refresh_access_token` (grant_type=ig_refresh_token; "at least 24 hours old",
    sin caducar). Fuente: [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login).
  - Permisos vigentes: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_messages`,
    `instagram_business_manage_comments` (los antiguos `business_*` "deprecated on January 27, 2025").
  - Publicación en `graph.instagram.com/<v>/<IG_ID>/media` y `/media_publish` ([Content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing)).
  - Mensajes: `/<IG_ID>/messages` o `/me/messages`, `Authorization: Bearer <INSTAGRAM_USER_ACCESS_TOKEN>`, texto ≤ 1000 bytes
    ([Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api));
    conversaciones `/<IG_ID>/conversations` (o `/me/conversations?platform=instagram`), solo los 20 mensajes más recientes
    ([Conversations API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/conversations-api)).
  - Webhooks: `POST graph.instagram.com/<v>/<INSTAGRAM_ACCOUNT_ID>/subscribed_apps?subscribed_fields=…` con el token de
    usuario de Instagram; "Your app must be published or Live to receive notifications for app users"
    ([Set up webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup)). `entry.id` = "The
    Instagram professional account ID of your app user" ([ejemplos](https://developers.facebook.com/documentation/instagram-platform/webhooks/examples)).
  - La doc dice que la firma `X-Hub-Signature-256` usa "your app's App Secret" sin aclarar si en Instagram Login es el
    *Instagram app secret*: el webhook acepta cualquiera de los dos (`META_APP_SECRET` o `INSTAGRAM_APP_SECRET`).
- Consola de Meta (app `29288275864162154`): producto **Instagram** → *API setup with Instagram login*:
  1. Business login settings → **OAuth redirect URIs**: `https://kreo-nine.vercel.app/api/oauth/instagram/callback` y
     `https://kreo-nine.vercel.app/api/inbox/oauth/instagram/callback`. Copiar *Instagram app ID* y *Instagram app secret* a Vercel.
  2. **Webhooks** (dentro del producto Instagram): URL `https://kreo-nine.vercel.app/api/inbox/meta/webhook`, el mismo verify
     token (`META_WEBHOOK_VERIFY_TOKEN`) y suscribir el campo **`messages`**.
  3. **Roles → Instagram testers**: añadir la cuenta de Instagram y **aceptar la invitación** desde Instagram
     (Configuración → Apps y sitios web → Invitaciones de tester). Sin aceptar, el login falla en modo desarrollo.
  4. Permisos: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_messages`.
     `instagram_business_manage_comments` **no hace falta** (no se usa; no añadirlo a la revisión).
  5. En la cuenta de Instagram: Configuración → Mensajes → **Herramientas conectadas → permitir acceso a los mensajes**.
- Tokens: 60 días; Kreo los refresca solo (tarea diaria `instagram-token-refresh` + ciclo de métricas) cuando quedan < 10 días.
- Business Discovery (Competencia) **no existe** con Instagram Login: solo funciona con cuentas conectadas por Facebook Login.
- Sin migración de base de datos: la variante se guarda en `social_accounts.metadata.login = "instagram"` (y en
  `inbox_connections.metadata`); las de Facebook Login conservan `page_id`.

## Actualización 2026-11-26 (Bandeja con Instagram API with Unified Login + comentarios)
- En la app `29288275864162154` no aparece «API setup with Instagram login» (las apps nuevas ya no pueden usarla: "Newly
  created apps can't set up the Instagram API with Instagram Login",
  [guía de migración](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/migration-guide)).
  El código de Instagram Login queda latente (sin `INSTAGRAM_APP_ID` no se activa). **Si algún día se pone `INSTAGRAM_APP_ID`,
  la Bandeja vuelve a Instagram Login y deja de usar Unified Login.**
- La Bandeja usa la configuración **1203482298883759** (`META_INBOX_LOGIN_CONFIG_ID`), creada con «Create new configuration»
  en *Use cases → Manage messaging & content on Instagram → API setup with Unified login* (app del portfolio «Akerra»).
  Es Facebook Login for Business y devuelve un **Business Integration System User Access Token** (BISU):
  "Your app receives a Business Integration System User Access Token… This access token belongs to your client's business
  portfolio" ([Authentication](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication)).
- Flujo implementado (`src/lib/inbox/instagram-facebook.ts`): code → `GET /oauth/access_token` → `GET /debug_token`
  (permisos y caducidad) → `GET /me/assigned_instagram_accounts` (debe incluir la cuenta conectada en Cuentas) →
  `POST /<IG_ID>/subscribed_apps?subscribed_fields=messages,comments` → `GET /me?fields=client_business_id`.
  Luego todo contra `graph.facebook.com/<IG_ID>/…`: `conversations`, `messages`, `media`, `/<MEDIA_ID>/comments`,
  `/<COMMENT_ID>/replies`, `/<COMMENT_ID>?hide=`. Sin página de Facebook. Si `/me/assigned_instagram_accounts` no
  responde (token de usuario de una configuración clásica), se usa el flujo antiguo con página.

| Permiso (config 1203482298883759) | ¿Lo usa la Bandeja? | Para qué |
|---|---|---|
| `instagram_basic` | **Sí (obligatorio)** | `/me/assigned_instagram_accounts`, `/<IG_ID>/media` (publicaciones propias con comentarios) |
| `instagram_manage_messages` | **Sí (obligatorio)** | `/<IG_ID>/conversations`, `/<IG_ID>/messages` (respuesta en la ventana de 24 h), webhook `messages` |
| `instagram_manage_comments` | **Sí (opcional: activa «Comentarios»)** | `/<MEDIA_ID>/comments`, `/<COMMENT_ID>/replies`, ocultar/mostrar, webhook `comments` |
| `instagram_content_publish` | No (la publicación usa `META_LOGIN_CONFIG_ID`) | — **se puede quitar** de esta configuración |
| `ads_management` | No | — **se puede quitar** (en Unified Login, comentarios solo piden `instagram_basic` + `instagram_manage_comments`) |
| `ads_read` | No | — **se puede quitar** |
| `pages_show_list`, `pages_manage_metadata` | No hacen falta | Solo para el Facebook Login clásico con página. Excepción documentada: "Temporary limitation for messaging webhooks" (si el cliente no comparte la página, puede que no lleguen los webhooks de `messages`; solución temporal: otra configuración que pida la página + `pages_show_list`). En modo desarrollo no llegan webhooks de todas formas: la Bandeja sondea cada 30 min. |

- Consola de Meta: (1) en *API setup with Unified login → Configure your app*, **Redirect URL** =
  `https://kreo-nine.vercel.app/api/inbox/oauth/instagram/callback` (y en *Facebook Login for Business → Valid OAuth Redirect
  URIs*); (2) *Webhooks* de la app → objeto **Instagram** → campos `messages` y `comments` (mismo callback y verify token);
  (3) quitar `instagram_content_publish`, `ads_management` y `ads_read` de la configuración (*Edit permissions*) para la
  revisión; (4) la cuenta `akerra.nortasuna` es *Instagram Tester* (Standard Access basta para probar).
- Caducidad del BISU: depende de la configuración (se ve en su vista previa); si caduca, la conexión pasa a «caducada» y se
  reconecta. `client_business_id` se guarda en `inbox_connections.metadata` para la futura API de gestión de BISU.
- Gmail/Outlook «marcar como leído» en el propio buzón exigiría `gmail.modify` (restringido) y `Mail.ReadWrite`: **no se piden**;
  el código lo haría solo si ese permiso ya estuviera concedido (`src/lib/inbox/read-state.ts`).
