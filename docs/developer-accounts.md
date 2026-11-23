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
- [ ] Producto: **Instagram API con Facebook Login** (necesario para Business Discovery = análisis de competencia)
- [ ] **App Review → Advanced Access** para:

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
- Meta: `https://<dominio>/api/oauth/instagram/callback`
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
