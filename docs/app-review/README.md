# Dosieres de revisión de apps (App Review) · Kreo

> Preparado por `integraciones-rrss` el **2026-11-22**. Requisitos verificados ese día en la documentación oficial
> (enlaces en cada dosier y en "Fuentes" abajo). Las plataformas cambian las reglas a menudo: **vuelve a comprobar
> cada enlace el día que envíes**.
>
> Los textos para pegar en los formularios están **en inglés** (las plataformas revisan en inglés). Las explicaciones,
> en español. `<DOMINIO>` = dominio de producción definitivo (hoy `kreo-nine.vercel.app`, ver bloqueante B1).

| Dosier | Qué cubre |
|---|---|
| [google.md](google.md) | Verificación OAuth (YouTube sensible + Gmail restringido + CASA) y auditoría/cuota de YouTube API Services |
| [tiktok.md](tiktok.md) | App Review (Login Kit + Content Posting API) y auditoría de Direct Post |
| [meta.md](meta.md) | Business Verification + App Review (Advanced Access) de Instagram/Pages |
| [microsoft.md](microsoft.md) | Publisher verification (Microsoft AI Cloud Partner Program) para Outlook |

---

## 1. Tabla resumen

| Plataforma | Qué se pide | Requisitos previos BLOQUEANTES | Coste | Plazo típico (oficial si existe) | ¿Enviable hoy? |
|---|---|---|---|---|---|
| **Google · YouTube** | Verificación de app OAuth (scopes **sensibles**: `youtube.upload`, `youtube.readonly`, `youtube.force-ssl`, `yt-analytics.readonly`) | B1 dominio propio verificado en Search Console · B2 privacidad/términos sin marcadores · B5 cuenta de prueba · B6 scopes no usados (`yt-analytics.readonly`) · quitar el aviso falso "YouTube lo deja privado" | 0 € (dominio aparte) | Branding: minutos-2/3 días hábiles. Sensibles: **"up to 10 days"** (oficial) | ⛔ No (B1, B2) |
| **Google · YouTube API Services** | Formulario *Audit and Quota Extension* | Solo si se superan **100 `videos.insert`/día** o 10.000 u/día del resto, o para métricas derivadas (III.L). **Ya NO hace falta para publicar en público** (cambio oficial del 02-11-2026) | 0 € | Sin plazo oficial ("as soon as possible") | No hace falta todavía |
| **Google · Gmail** | Verificación de scope **restringido** (`gmail.readonly`) + `gmail.send` + **evaluación CASA anual** | Todo lo de YouTube + presupuesto CASA (decisión de Oier 💶) + recomendado **proyecto de Google Cloud separado** | CASA de pago (Google no publica precio; pedir presupuesto a laboratorios autorizados) 💶 | "Several weeks" (oficial) + CASA | ⛔ No |
| **TikTok** | 1) App Review → producción (Login Kit + Content Posting API). 2) **Auditoría de Direct Post** (quita el "solo privado") | B1 (recomendado; técnicamente se puede con vercel.app) · B2 · **verificar URL properties** (ToS, privacidad, web) · B6 quitar `video.list`/`video.upload` o implementarlos · B7 huecos de UX de las Content Sharing Guidelines · cambiar nombre "Kreo App" → "Kreo" | 0 € | Sin plazo oficial; habitual días-2 semanas (fuente no oficial) | ⛔ No (B6, B7) |
| **Meta** | **Business Verification** + App Review → Advanced Access de 8 permisos (+ opcional Human Agent) | **B3 entidad legal registrada** (Meta no admite verificación individual para Advanced Access) · B1 · B2 · B4 callbacks de desautorización y eliminación de datos · B6 `instagram_manage_insights` no usado · cuenta IG profesional de prueba | 0 € (pero B3 cuesta: alta de autónomo o sociedad 💶) | Sin plazo oficial verificado; habitual 1-4 semanas con reenvíos | ⛔ No (B3, B4) |
| **Microsoft** | **Publisher verification** (no hay App Review). Opcional pero muy recomendado para cuentas de empresa | B3 entidad legal registrada · email corporativo en dominio propio (no gmail/outlook) · documentos del dominio a nombre de la empresa · app registrada en un **tenant de Entra (cuenta de trabajo)**, no con cuenta personal | 0 € (Microsoft no cobra) | Verificación CPP: **3-5 días hábiles** (oficial); publisher: minutos | ⛔ No (B3, B1) |

### Bloqueantes transversales (B1-B8)

| # | Bloqueante | Afecta a | Qué hacer | Fuente |
|---|---|---|---|---|
| **B1** | **Dominio propio.** Google: la home "must be on a verified domain you own" y "should not be hosted on a third-party platform"; hay casos reales de verificación atascada con `*.vercel.app`. Microsoft: el *publisher domain* no puede ser compartido y debe coincidir con el email verificado. TikTok/Meta: no lo exigen, pero **cambiar de dominio después obliga a re-verificar URLs y a nueva revisión**. | Todas | Comprar dominio (💶, ~10-40 €/año), apuntarlo a Vercel **sin redirecciones** de la home, y dar de alta todo con él | [Google: requisitos](https://support.google.com/cloud/answer/13464321) · [Google: guía general](https://support.google.com/cloud/answer/13807376?hl=EN) · [foro Google, caso vercel.app](https://discuss.google.dev/t/oauth-branding-verification-stuck-home-page-url-not-registered-despite-search-console-verification-vercel-app/396107) |
| **B2** | **Textos legales publicados con marcadores** (`[RAZÓN SOCIAL]`, `[DOMICILIO]`, `[EMAIL DPD/PRIVACIDAD]`, `[DOMINIO]`, `[FECHA]`… comprobado en producción el 22-11-2026) y **sin revisión de abogado** (regla del proyecto, `docs/compliance.md`). | Todas | Rellenar datos reales del titular, que el abogado los revise, publicar en el dominio definitivo | `content/legal/{es,en}/*.md` |
| **B3** | **Identidad legal.** Meta: "individual verification will no longer be allowed" para Advanced Access. Microsoft CPP: verifica que el negocio "is legally registered". Google y TikTok aceptan persona física (con nombre real en los textos legales). | Meta, Microsoft | Decisión de Oier 💶: alta como **autónomo** (en España el documento típico sería el certificado de situación censal de la AEAT; confirmar en el flujo de Meta que lo acepta) o **sociedad** | [Meta 2023](https://developers.facebook.com/blog/post/2023/02/01/developer-platform-requiring-business-verification-for-advanced-access/) · [Microsoft CPP](https://learn.microsoft.com/en-us/partner-center/verification-responses) |
| **B4** | **Meta: faltan los callbacks** de desautorización y de **eliminación de datos** (URL + código de confirmación). No existen en `src/app/api`. | Meta | Implementar `/api/meta/deauthorize` y `/api/meta/data-deletion` (signed_request) + página de estado | `docs/compliance.md` (pendiente 1 del módulo de cuentas) |
| **B5** | **Cuenta de prueba en Kreo para revisores** (no existe). | Todas | Ver §3 | — |
| **B6** | **Scopes pedidos que el código NO usa** (motivo de rechazo nº 1 en TikTok y Google; Meta los rechaza sin screencast). | Todas | Implementar la función o quitar el scope (tabla §2) | [TikTok](https://developers.tiktok.com/doc/app-review-guidelines) · [Google](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) |
| **B7** | **TikTok: UX de Direct Post incompleta** (creator_info al abrir el editor, duración máxima, toggle de divulgación comercial, enlaces de las declaraciones, aviso de procesamiento…). | TikTok | Lista exacta en [tiktok.md §2](tiktok.md) | [Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines) |
| **B8** | **La landing anuncia "Waitlist open" y marca Bandeja y Clipper como "Coming soon"**, pero las revisiones demuestran la bandeja. TikTok rechaza apps "still in development or testing"; Google exige que la home describa la funcionalidad real. | Todas | Antes de enviar: quitar "Coming soon" de lo que se demuestra y dejar alta abierta (o explicar el acceso a revisores) | [TikTok](https://developers.tiktok.com/doc/app-review-guidelines) |

> Microsoft también: si el registro de la app se hizo con una **cuenta personal de Microsoft**, no se puede verificar
> el editor ("Apps that are registered by using a Microsoft account can't be publisher verified"): hay que registrarla de
> nuevo en un tenant de Entra.

---

## 2. Matriz scope → código (estado a 22-11-2026)

| Plataforma | Scope / permiso | ¿Se usa en el código? | Acción antes de enviar |
|---|---|---|---|
| YouTube | `youtube.upload` | ✅ `publish.ts` (videos.insert, thumbnails.set) | Mantener |
| YouTube | `youtube.readonly` | ✅ `youtube.ts` (channels.list), `listYouTubePlaylists` | Mantener (ver nota de redundancia en google.md) |
| YouTube | `youtube.force-ssl` | ✅ playlistItems.insert (commit 8b939f4). Subtítulos (captions.insert): **aún no implementado** | Pedirlo **de forma incremental** (solo al activar listas/subtítulos). Justificar subtítulos solo si están implementados el día del envío |
| YouTube | `yt-analytics.readonly` | ❌ ninguna llamada a YouTube Analytics API (las métricas salen de `channels.list`) | **Quitar** o implementar analíticas de YouTube Analytics antes |
| Gmail | `gmail.readonly` (restringido), `gmail.send` | ✅ `inbox/providers/gmail.ts` | Mantener; mover a proyecto de Google separado |
| TikTok | `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.publish` | ✅ | Mantener |
| TikTok | `video.list` | ❌ no se llama a `/v2/video/list/` | **Quitar** o implementar "Top posts" con métricas por vídeo |
| TikTok | `video.upload` | ❌ no se usa la subida a borradores (inbox) | **Quitar** o implementar "Enviar a borradores de TikTok" |
| Meta | `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement` | ✅ | Mantener |
| Meta | `instagram_manage_insights` | ❌ `fetchStats` solo lee `followers_count,media_count` (eso es `instagram_basic`) | **Quitar** o implementar insights (alcance, visualizaciones) |
| Meta | `instagram_manage_messages`, `pages_manage_metadata` | ✅ bandeja + webhook | Mantener, en una **configuración de login aparte** |
| Meta | `business_management` | ⚠️ no se llama a la Business Manager API; puede hacer falta para que `/me/accounts` devuelva páginas de un portfolio | Probar con una página dentro de un portfolio; si no es imprescindible, **quitar** |
| Microsoft | `openid`, `email`, `offline_access`, `Mail.Read`, `Mail.Send` | ✅ | Mantener |

---

## 3. Cuentas de prueba que hay que crear (sin credenciales en el repo)

Las credenciales se guardan en el gestor de contraseñas de Oier y se pegan **solo** en el campo privado de cada
formulario de revisión. Nunca en este repo.

1. **Kreo (para todos los revisores):** usuario `review@<DOMINIO>` (buzón real que Oier pueda leer), contraseña larga
   única, **sin 2FA** (o con instrucciones TOTP si la plataforma lo admite), email confirmado, plan **Fundador** (interno)
   con créditos de IA suficientes, workspace "Kreo Review", proyecto "Demo Coffee Shop" con brand kit relleno, 2-3 imágenes
   y 1 vídeo vertical propio (≤ 50 MB, sin música con copyright). Rol **admin** (para que pueda aprobar).
2. **Google:** cuenta de Google nueva y dedicada (p. ej. "Kreo Demo") con **canal de YouTube** creado, 1 lista de
   reproducción y algún vídeo; con Gmail que reciba 2-3 correos de prueba de otra cuenta tuya. Añadirla como *test user*
   mientras la app esté en "Testing".
3. **TikTok:** cuenta de TikTok dedicada, **puesta en privado** (obligatorio mientras la app no esté auditada) y añadida como
   *target user* del sandbox.
4. **Meta:** cuenta de Facebook de Oier con rol en la app + **Página de Facebook "Kreo Demo"** + **cuenta de Instagram
   profesional (Creator o Business)** vinculada a esa página, con "Permitir acceso a los mensajes" activado; una segunda
   cuenta de Instagram personal para enviarle DMs de prueba. (Meta prueba con sus propias cuentas; esto es para grabar.)
5. **Microsoft:** cuenta personal outlook.com de prueba y, si es posible, un buzón de un tenant de trabajo de prueba.

---

## 4. Orden recomendado

1. **Decisiones de Oier (💶 / difíciles de deshacer):** dominio propio (B1), forma jurídica (B3), email corporativo
   (soporte@, privacidad@), abogado para los textos (B2), y si se va a pagar CASA para Gmail.
2. **Código (una tanda, antes de grabar nada):** B4 callbacks de Meta, B6 limpiar scopes, B7 UX de TikTok, quitar el
   aviso `posts.youtube.unauditedPrivate` (ya es falso), proyecto de Google separado para Gmail, configuración de login
   de Meta separada para la bandeja, B8 landing. Pasar `seguridad-legal` y `qa-tester`.
3. **Legales definitivos publicados** en `<DOMINIO>` (es + en, URL estable en inglés para los revisores).
4. **Google · YouTube** (lo más rápido y solo exige persona física + dominio). Enviar en cuanto 1-3 estén listos.
5. **TikTok · App Review** (en paralelo con 4) → cuando esté en producción, **auditoría de Direct Post**.
6. **Meta · Business Verification** (en cuanto exista la entidad) → **App Review** (las llamadas de prueba deben hacerse
   en los 30 días previos al envío).
7. **Microsoft · CPP + Publisher verification** (cuando haya entidad + email corporativo). Outlook funciona ya sin ello
   para cuentas personales, con aviso de "editor no verificado".
8. **Gmail restringido + CASA** al final (o nunca, si se opta por solo Outlook / reenvío de correo).
9. **YouTube Audit & Quota Extension** cuando el uso real se acerque a 100 subidas/día o se quieran métricas derivadas.

### Lo que SÍ se puede hacer hoy sin arrepentirse
- Crear las cuentas de prueba (§3) y ensayar los guiones en modo Testing / sandbox / desarrollo.
- Publicar en YouTube en público con el proyecto sin verificar (máx. 100 usuarios de prueba y 100 subidas/día).
- Probar TikTok en sandbox con la cuenta de prueba en privado.
- Preparar logos: Google 120×120 px, Meta 1024×1024 px (sin marcas de Meta), TikTok icono claro sin parecerse a marcas.

---

## 5. Puntos fuertes de Kreo para TODAS las revisiones (usarlos en los textos)
- **Human-in-the-loop:** nada se publica ni se envía sin un clic humano ("Approve" / "Send"). La IA solo propone borradores.
- **Sin automatización de engagement:** el contrato de plataformas de Kreo no tiene likes, follows, comentarios ni DMs en frío.
- **Etiqueta IA activada por defecto y no desactivable** si hay medios generados con IA: TikTok `is_aigc`, YouTube
  `status.containsSyntheticMedia`, Instagram texto de divulgación al final del caption.
- **Ventana de 24 h de Instagram** aplicada en servidor y explicada en la UI; sin etiquetas de mensaje salvo HUMAN_AGENT aprobado.
- **Minimización:** solo datos de las cuentas propias del usuario; mensajes borrados a los 30 días; tokens cifrados AES-256-GCM.
- **Límites anti-spam:** máx. publicaciones/día por cuenta, aviso de textos duplicados, máx. 30 respuestas/hora en la bandeja.

---

## 6. Datos que conviene actualizar en `docs/developer-accounts.md` (no lo toco, aviso)
- YouTube: desde el **02-11-2026** las subidas desde proyectos sin verificar **ya no quedan en privado**; la subida cuesta
  ~100 unidades (desde 04-12-2025) y desde el 01-06-2026 `videos.insert` tiene **su propio bucket** (100 llamadas/día por defecto).
  Fuente: [YouTube Data API revision history](https://developers.google.com/youtube/v3/revision_history) y
  [Quota and compliance audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits).
- Meta: *Access Verification* para Tech Providers figura como **"no longer required"**
  ([doc oficial](https://developers.facebook.com/documentation/development/release/access-verification)); Business
  Verification sigue siendo necesaria.
- TikTok: verificación de **URL properties obligatoria** para ToS, privacidad y web
  ([configuración](https://developers.tiktok.com/docs/en/set-up-development-configuration)).

## Fuentes principales (consultadas el 2026-11-22)
- Google: [Verification requirements](https://support.google.com/cloud/answer/13464321) ·
  [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) ·
  [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) ·
  [Security assessment](https://support.google.com/cloud/answer/13465431?hl=en) ·
  [YouTube quota & audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits) ·
  [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- TikTok: [App Review Guidelines](https://developers.tiktok.com/doc/app-review-guidelines) ·
  [Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines) ·
  [Content Posting API – Get started](https://developers.tiktok.com/doc/content-posting-api-get-started) ·
  [Direct Post reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- Meta: [App Review submission guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide) ·
  [Instagram App Review](https://developers.facebook.com/docs/instagram-platform/app-review) ·
  [Business Verification](https://developers.facebook.com/docs/development/release/business-verification) ·
  [Permissions reference](https://developers.facebook.com/docs/permissions/reference)
- Microsoft: [Publisher verification overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview) ·
  [Troubleshoot](https://learn.microsoft.com/en-us/entra/identity-platform/troubleshoot-publisher-verification) ·
  [Partner Center verification](https://learn.microsoft.com/en-us/partner-center/verification-responses)
