# Registro de cumplimiento

Mantenido por el subagente `seguridad-legal`. Cada módulo añade una entrada **antes** de darse por terminado.

> ⚖️ Recordatorio: un abogado debe revisar todos los textos legales (privacidad, términos, cookies, aviso legal,
> términos de afiliados) antes del lanzamiento público.

## Plantilla por módulo
```
## <Módulo> — <fecha> — Estado: ✅ aprobado / ⚠️ con condiciones / ⛔ vetado
- APIs usadas:
- Permisos / scopes (y justificación):
- Datos guardados (qué, dónde, cuánto tiempo):
- Riesgos:
- Mitigaciones:
- Pendiente:
```

---

## Fase 0 · Brand preview — 2026-11-18 — Estado: ✅ aprobado
- APIs usadas: ninguna.
- Permisos: ninguno.
- Datos guardados: ninguno. Sin cookies; sin analítica. Página con `noindex`.
- Fuentes: Google Fonts (Space Grotesk, JetBrains Mono, Bricolage Grotesque, DM Sans, DM Mono, Sora, Inter),
  todas con licencia SIL OFL (uso comercial permitido). Se sirven auto-alojadas vía `next/font`
  (no se envían peticiones del navegador a Google → sin transferencia de IP a terceros).
- Iconos: Lucide (licencia ISC).
- Riesgos: el nombre elegido puede chocar con marcas registradas.
- Mitigaciones: comprobar EUIPO (eSearch plus), OEPM y TMview en clases 9, 35 y 42 + dominio antes de
  invertir en marca. Considerar consulta a un agente de propiedad industrial antes de registrar.

## Fase 0 · Design system e infraestructura — 2026-11-18 — Estado: ✅ aprobado
- APIs usadas: ninguna en la app. Infraestructura creada: Vercel (proyecto `kreo`, funciones en `fra1`) y
  Supabase (proyecto `kreo`, región `eu-central-1`). Todavía no hay tablas ni datos personales.
- Variables públicas en Vercel: URL de Supabase y clave *publishable* (diseñada para estar en el navegador;
  la protección real será RLS en todas las tablas). La `service_role`/secret key NO está en Vercel ni en el repo:
  se añadirá como variable *sensitive* solo cuando la necesite el backend.
- Datos guardados: ninguno. `next-themes` guarda la preferencia claro/oscuro en `localStorage`
  (estrictamente necesaria para una función pedida por el usuario → exenta de consentimiento, LSSI art. 22.2).
  Hay que mencionarla en la política de cookies.
- Fuentes Space Grotesk y JetBrains Mono (SIL OFL), auto-alojadas. Iconos Lucide (ISC). Componentes shadcn/ui y Radix (MIT).
- Logo: wordmark derivado de Space Grotesk (la OFL permite usar la fuente en un logo; el logo no es una redistribución de la fuente).
- Subencargados nuevos: Vercel Inc. y Supabase Inc. → añadir a la lista de subencargados y firmar sus DPA
  (ambos ofrecen DPA con cláusulas contractuales tipo para transferencias internacionales).
- Riesgos: conflicto de marca "Kreo"; despliegues de vercel.app accesibles con enlace.
- Mitigaciones: comprobación EUIPO/OEPM pendiente; Vercel Authentication activa en las URLs de Vercel; `noindex` global.

## Fase 1 · Auth, workspaces, proyectos, brand kit y créditos — 2026-11-18 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: Supabase Auth (email + contraseña) y Postgres/Storage de Supabase (UE, Frankfurt). Ninguna red social todavía.
- Datos guardados:
  - `auth.users` (Supabase): email, hash de contraseña, metadatos de registro (nombre, idioma, fecha de aceptación de términos).
  - `profiles`: nombre, idioma, avatar (vacío), `marketing_opt_in` (siempre false hasta tener doble opt-in).
  - Workspaces, miembros con rol, proyectos, brand kits (texto de marca, colores, fuentes, enlaces a posts de ejemplo; **sin descargar contenido de terceros**).
  - Créditos: saldo + ledger inmutable. Registro de actividad sin datos personales en `metadata`.
- Cookies: sesión de Supabase (`sb-*`, estrictamente necesaria), `NEXT_LOCALE` (idioma elegido) y `kreo_ws` (workspace activo, httpOnly). Todas técnicas → exentas de consentimiento (LSSI 22.2); a listar en la política de cookies.
- Seguridad verificada:
  - RLS en todas las tablas; prueba con un usuario ajeno: 0 filas visibles y 0 actualizaciones posibles.
  - Escrituras sensibles solo vía funciones `SECURITY DEFINER` con `search_path` vacío y comprobación de rol.
  - Créditos: cobro atómico (bloqueo de fila), idempotente por clave; `grant_credits` solo para el servidor (el usuario recibe "permission denied").
  - `plan_id` del workspace no lo puede cambiar el usuario (solo el servidor/Stripe).
  - Validación con zod en todas las acciones; redirecciones internas solo hacia `/app` (sin open redirect); errores traducidos sin filtrar mensajes internos.
  - Bucket `brand-assets` privado, por workspace, sin SVG (evita scripts embebidos), máx. 5 MB.
- Riesgos / condiciones pendientes antes del lanzamiento:
  1. **Email transaccional propio (SMTP)**: el de Supabase solo es para pruebas. Necesario para confirmación de cuenta y recuperación de contraseña.
  2. **Recuperar contraseña, exportar datos y borrar cuenta** (derechos RGPD): pendientes en esta fase.
  3. **2FA (TOTP)** opcional: pendiente en esta fase.
  4. Textos legales: páginas creadas como borrador vacío; hay que redactarlas y que las revise un abogado.
  5. El checkbox de marketing se eliminó del registro hasta implementar doble opt-in.
  6. La aceptación de términos se guarda en los metadatos de registro; conviene versionar los términos aceptados.

## Textos legales — borradores — 2026-11-18 — Estado: ⚠️ borrador, pendiente de abogado
- Redactado (es + en, mismos nombres de archivo): `content/legal/{es,en}/privacidad.md`, `terminos.md`, `cookies.md`,
  `aviso-legal.md`, `afiliados.md`. Además `docs/subprocessors.md` (subencargados) y `docs/ropa.md` (registro art. 30,
  como responsable y como encargado). Los datos de empresa usan los mismos marcadores en ambos idiomas
  (`[RAZÓN SOCIAL]`, `[NIF]`, `[DOMICILIO]`, `[EMAIL DE CONTACTO]`, `[EMAIL DPD/PRIVACIDAD]`, `[DOMINIO]`, `[FECHA]`…) para sustituirlos de una vez.
- Cláusulas de plataformas incluidas en la política de privacidad: Google Limited Use (frase literal en inglés + traducción,
  sin uso para IA general ni lectura humana), YouTube API Services (Términos de YouTube, Política de privacidad de Google,
  enlace de revocación, borrado ≤ 7 días tras revocar, refresco ≤ 30 días), Meta (datos obtenidos + instrucciones de
  eliminación y código de confirmación), TikTok (datos por scope + cómo revocar), Microsoft Graph (scopes + revocación),
  Shopify (Kreo encargado, webhooks RGPD).
- La página `/legal/[slug]` todavía no carga estos Markdown y no tiene ruta para `afiliados`; hay que conectarlo (no lo he tocado).
- **El abogado DEBE revisar**:
  1. Roles responsable/encargado: bandeja de DMs/emails, Shopify y agencias → Kreo como encargado; falta redactar el **DPA para clientes** (art. 28.3) al que remiten los términos.
  2. Base legal del análisis de competencia, Ad Library y proveedor de TikTok (interés legítimo + LIA + deber de información del art. 14) y la licitud del método de obtención del proveedor de TikTok.
  3. Desistimiento: cobro proporcional de la suscripción, pérdida del derecho sobre créditos consumidos (art. 103.m TRLGDCU) y **función de desistimiento** de la Directiva (UE) 2023/2673 (aplicable desde el 19-06-2026). Política de no reembolso y caducidad de créditos (definir plazo).
  4. ODR: la plataforma europea cerró el 20-07-2025 (Reglamento (UE) 2024/3228); he quitado el enlace y lo he sustituido por información sobre resolución alternativa de litigios. Confirmar y decidir adhesión a arbitraje de consumo.
  5. AI Act art. 50 (obligaciones de transparencia aplicables desde el 02-08-2026 salvo cambios por el "Digital Omnibus"; verificar estado): si Kreo es "proveedor" del sistema que genera contenido sintético y debe aplicar marcado legible por máquina (C2PA/metadatos); si se permite al usuario desactivar la etiqueta IA.
  6. Limitación de responsabilidad (consumidores vs. profesionales), indemnidad, cambios unilaterales de términos y precios.
  7. Plazos de conservación propuestos (30/90 días, caché de mensajes 30 días, logs 90 días) y necesidad de DPD y de EIPD para la bandeja + IA.
  8. Afiliados: régimen fiscal (factura, IVA, retención IRPF, no residentes), aplicación del RD 444/2024 y método de atribución (las cookies de afiliación requieren consentimiento).
  9. Prevalencia de la versión española sobre la inglesa.
- **Pendiente técnico/negocio**: datos de la empresa; firmar DPA de todos los subencargados (todos "pendiente"); verificar que fal.ai, Replicate y ElevenLabs no entrenan con los datos y sus plazos de retención; elegir proveedor de email UE; publicar URL de instrucciones de eliminación de datos para Meta; versionar los términos aceptados; banner y enlace "Configurar cookies" con `kreo_consent`.
- ⚖️ Recordatorio a Oier: **ningún texto puede publicarse sin revisión de un abogado**; las revisiones de Meta, TikTok y Google exigen estas páginas publicadas en el dominio definitivo.

---

# Revisión de los módulos de la Fase 1 — 2026-11-19

Revisión hecha leyendo el código. Correcciones pequeñas aplicadas directamente (marcadas **[arreglado]**).
Las de base de datos están en `supabase/migrations/20261119120000_compliance_fixes.sql`: **todavía NO está aplicada**;
hay que aplicarla y pasar `qa-tester` antes del merge.

## Cuenta y RGPD (recuperar contraseña, 2FA, exportar, borrar cuenta) — 2026-11-19 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: Supabase Auth (contraseña, `resetPasswordForEmail`, MFA TOTP), Postgres y Storage de Supabase (UE).
- Permisos: ninguno de terceros.
- Datos guardados: factores TOTP en `auth.mfa_factors` (Supabase). La exportación se genera al vuelo (no se guarda).
  El borrado elimina `auth.users` y en cascada perfil, membresías, sesiones, factores y los workspaces en los que es el único miembro.
- Riesgos detectados:
  1. Las políticas restrictivas `mfa_required` no se aplican dentro de funciones `SECURITY DEFINER` (`approve_post`,
     `delete_my_account`, `upsert_social_account`, `start_ai_generation`…) ni a Storage, y las server actions no pasan por el
     layout que exige aal2 → con solo la contraseña (sesión aal1) se podía aprobar un post o borrar la cuenta.
  2. El borrado de cuenta no eliminaba los archivos del bucket `project-media` (subidas y generaciones de IA).
  3. La exportación no incluía cuentas conectadas, publicaciones, generaciones de IA ni archivos (art. 15/20 incompleto).
  4. Solo se revocan los tokens de las cuentas sociales de los workspaces en solitario: si el usuario conectó su canal/cuenta
     personal en un workspace compartido, el token sigue activo tras borrar su cuenta.
- Mitigaciones:
  - **[arreglado]** `has_workspace_role()` exige `mfa_satisfied()` (cubre todas las RPC y las políticas de Storage) y
    `delete_my_account()` lo comprueba; además `changePassword` y `deleteAccount` comprueban aal2 en el servidor.
  - **[arreglado]** `deleteAccount` borra también `project-media/{workspace}`.
  - **[arreglado]** La exportación añade `social_accounts` (sin tokens), `posts`, `post_targets`, `ai_generations` y `assets` propios; texto de la UI actualizado.
  - Respuesta idéntica exista o no el email al recuperar contraseña; redirecciones solo a `/app` (sin open redirect).
- Pendiente:
  - **Decisión de Oier** (riesgo 4): al borrar la cuenta, ¿revocar también las cuentas sociales con `connected_by = usuario`
    en workspaces compartidos (avisando al equipo)? Recomendado sí para YouTube/TikTok (el token es personal del usuario).
  - Códigos de recuperación de 2FA (si pierde el móvil hoy solo puede recuperarla soporte): definir procedimiento.
  - La exportación no incluye los archivos binarios (solo rutas); valorar ZIP o URLs firmadas.

## Lista de espera (doble opt-in, referidos) y emails — 2026-11-19 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: Resend (REST) si hay `RESEND_API_KEY`; sin proveedor en producción falla de forma controlada.
- Permisos: ninguno.
- Datos guardados: `waitlist` (email, idioma, código de referido, quién le refirió, hashes SHA-256 de los tokens,
  fecha de consentimiento y de confirmación). Sin RLS de usuario (solo `service_role`). No confirmados: borrado a los 7 días
  (`data-retention` de Inngest). Baja = borrado del registro.
- Verificado: doble opt-in real (no se confirma sin clic), consentimiento obligatorio con enlace a la privacidad, honeypot,
  respuesta idéntica exista o no el email, tokens nunca en claro en BD, baja en un clic con `List-Unsubscribe` +
  `List-Unsubscribe-Post` (RFC 8058), logs sin emails (solo códigos de error), aviso de indicar que el enlace de referido es una invitación.
- Riesgos detectados y mitigaciones:
  - **[arreglado]** El enlace reenviado caducaba según `created_at` (el reenvío tras 7 días nunca se podía confirmar) → ahora según `consent_at`, también en la purga.
  - **[arreglado]** Reenvíos ilimitados al mismo email (bombardeo de buzones) → máx. uno cada 10 min.
  - **[arreglado]** La versión de texto del email perdía la URL de baja → los enlaces se conservan como "texto: URL".
  - El GET de `/waitlist/unsubscribe` borra directamente: los escáneres de enlaces del correo pueden dar de baja sin querer
    (error "a favor" de la privacidad). Recomendado: página de confirmación con botón (POST) en el enlace del cuerpo.
- Pendiente: proveedor de email con región UE y DPA (Resend, por defecto en EE. UU.); dominio con SPF/DKIM/DMARC;
  rate limit por IP del formulario (Vercel Firewall/WAF) antes del lanzamiento; decidir si se informará a los referidos de que su
  alta beneficia a quien les invitó (transparencia del programa de referidos).

## Banner de cookies — 2026-11-19 — Estado: ✅ aprobado
- APIs usadas: ninguna. Cookie `kreo_consent` (JSON con versión, categorías y fecha; 182 días; `Secure`, `SameSite=Lax`).
- Verificado: no hay ningún script, píxel ni analítica de terceros en el código (no se carga nada antes ni después de consentir);
  "Aceptar" y "Rechazar" con el mismo peso visual en la primera capa; configuración por categorías desactivadas por defecto;
  reabrible desde el pie ("Configurar cookies"); `hasConsent()` disponible para cargar scripts futuros.
- Riesgos: cuando se añada analítica o afiliados, hay que borrar sus cookies al retirar el consentimiento y añadir el enlace de
  configuración también dentro de `/app`. Los avatares de TikTok/Instagram/YouTube se cargan desde sus CDN (IP del navegador a
  terceros, sin cookies): mencionarlo en la política o servirlos a través de Kreo.
- Pendiente: listar `kreo_consent` y las cookies OAuth `kreo_oauth_*` (técnicas, 10 min) en la política de cookies.

## Cuentas sociales (OAuth TikTok / Instagram / YouTube, tokens cifrados, revocación) — 2026-11-19 — Estado: ⚠️ aprobado con condiciones
- APIs usadas (todas oficiales, OAuth oficial): TikTok Login Kit v2 + Display API + Content Posting API; Instagram API con
  Facebook Login (Graph API); Google OAuth 2.0 (con PKCE) + YouTube Data API v3 + YouTube Analytics API.
- Permisos / scopes:
  - TikTok: `user.info.basic` (id, avatar, nombre), `user.info.profile` (username), `user.info.stats` (métricas), `video.list`
    (métricas por vídeo), `video.publish` (Direct Post). ⚠️ `video.upload` (subir a borradores) **no se usa** en el código → quitarlo
    o implementar el envío a borradores como alternativa mientras no haya auditoría.
  - Instagram: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `pages_show_list`,
    `pages_read_engagement` (necesarios para listar la cuenta IG vinculada y publicar). ⚠️ `business_management` solo hace falta si
    la página se gestiona desde un Business Manager: justificarlo en App Review o quitarlo.
  - YouTube: `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly` (mínimos para publicar y leer estadísticas del propio canal).
- Datos guardados: `social_accounts` (id externo, handle, nombre, avatar, scopes, estado, límite diario); `social_account_tokens`
  (access/refresh **cifrados AES-256-GCM** con subclave HMAC derivada de `TOKEN_ENCRYPTION_KEY`, RLS sin políticas → solo `service_role`).
  Hasta la desconexión; al desconectar se revoca en la plataforma y se borran en cascada tokens, métricas y destinos.
- Verificado: estado OAuth firmado (HMAC) en cookie httpOnly de 10 min (anti-CSRF) + PKCE en Google; rol editor+ comprobado con la
  sesión del usuario; tokens nunca en logs ni en respuestas (solo códigos de error); backoff exponencial con `Retry-After`, máx. 3
  intentos; ningún método de engagement en el contrato de plataformas (sin likes, follows, comentarios ni DMs); enlaces a Términos de
  YouTube y Política de privacidad de Google al conectar.
- Riesgos / mitigaciones:
  - **[arreglado]** YouTube Developer Policies III.E.3: los datos autorizados solo pueden verlos el usuario o "agentes aprobados
    expresamente" → el texto de conexión indica ahora que los miembros del workspace verán los datos del canal.
  - **[arreglado]** El aviso de desconexión ahora dice que también se borran métricas y destinos.
  - Instagram: se conectan automáticamente **todas** las cuentas IG de las páginas autorizadas → añadir selector (minimización).
  - Meta: el token va en la query string → usar cabecera `Authorization` + `appsecret_proof`.
  - Revocación desde la propia plataforma: hoy la cuenta pasa a `expired` y sus datos se conservan.
- Pendiente (bloqueante para App Review / producción):
  1. Callbacks de Meta: **desautorización** y **eliminación de datos** (URL + código de confirmación).
  2. YouTube: purga automática de datos de canales sin autorización vigente (≤ 30 días si se revoca desde Google; ≤ 7 días si se
     revoca/borra desde Kreo, que ya se cumple). **Decisión de Oier**: borrar solo las métricas o la cuenta entera.
  3. Si falla el código tras obtener tokens (p. ej. límite del plan), revocar el token recién obtenido.

## Publicaciones y calendario (aprobación humana, límites anti-baneo, reglas por red) — 2026-11-19 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: ninguna externa (base de datos). Funciones `submit_post`, `approve_post`, `unschedule_post`, `post_limit_violations`, triggers `guard_post_status` / `guard_target_status`.
- Permisos: editor crea y envía; **solo admin aprueba** (único camino a `scheduled`); el servidor (`service_role`) publica.
- Datos guardados: `posts`, `post_targets` (caption por cuenta, opciones de plataforma), `assets` en el bucket privado `project-media`.
- Verificado: nada pasa a `approved/scheduled` sin `approve_post`; editar un post aprobado lo devuelve a pendiente; límites diarios
  conservadores por cuenta (3/5/3, máx. 10/25/10) comprobados al aprobar; aviso de texto duplicado en ≥ 3 cuentas con variaciones
  por IA; TikTok: privacidad sin valor por defecto, divulgación comercial ("Tu marca" / "Contenido de marca", este último no puede ser
  privado), "Publicando como @…", aviso de app no auditada; aviso de derechos al subir.
- Riesgos detectados y mitigaciones:
  - ⛔→**[arreglado]** Un editor podía cambiar el **texto por cuenta, las opciones o la cuenta de destino** de un post ya aprobado sin
    volver a aprobarlo (`guard_target_status` no lo vigilaba) → ahora el post vuelve a "pendiente de aprobación".
  - **[arreglado]** La etiqueta IA de un post se podía desactivar por API aunque tuviera medios IA → trigger `posts_ai_label` la fuerza;
    cambiarla (o el título) en un post aprobado exige reaprobar.
  - **[arreglado]** TikTok: comentarios/dúos/stitch salían **activados por defecto** (las Content Sharing Guidelines exigen que no) →
    ahora desactivados salvo que el usuario los active; texto "Política de contenido de marca + Confirmación de uso de música" al marcar contenido de marca.
- Pendiente (antes de la auditoría de TikTok):
  1. Consultar `creator_info` **al abrir el editor**: mostrar solo sus `privacy_level_options`, deshabilitar interacciones que el
     creador tenga desactivadas y respetar `max_video_post_duration_sec`; si no puede publicar, bloquear.
  2. Mientras la app no esté auditada, permitir solo `SELF_ONLY` (si no, la publicación falla).
  3. Divulgación de **colaboración pagada en Instagram y YouTube** (hoy solo TikTok): casilla que añada "Publicidad"/"#ad" al texto
     en Instagram y marque la colocación de producto pagada en YouTube (verificar campo de la API). Obligatorio por la LGCA/RD 444/2024 y normas de las plataformas.
  4. Instagram: con la divulgación IA añadida el caption puede superar 2.200 caracteres → validarlo antes de aprobar.

## Worker de publicación y métricas (Inngest) — 2026-11-19 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: Inngest (cola/cron, firmado con `INNGEST_SIGNING_KEY`); Instagram Content Publishing API; TikTok Content Posting API
  (Direct Post, `FILE_UPLOAD`); YouTube Data API v3 (subida reanudable); endpoints de perfil/estadísticas de cada red.
- Datos guardados: estado y resultado por destino (`external_post_id`, URL, código de error), `account_metrics_daily` (seguidores,
  vistas, likes, nº de posts de las **cuentas propias autorizadas**). Plazos: ver pendientes.
- Verificado: doble garantía de aprobación (la consulta de destinos debidos exige `scheduled` en post y destino, y el paso `claim`
  vuelve a comprobar `approved_by`); reclamación atómica e idempotente (id de evento = id del destino); 1 publicación a la vez y
  máx. 1/min por cuenta; 2 reintentos solo para 429/5xx; sin acciones de engagement. Etiqueta IA nativa: TikTok `is_aigc`,
  YouTube `status.containsSyntheticMedia`; Instagram: "Contenido generado con IA · AI-generated content" al final del caption
  (la API no expone campo); el texto de la UI ya lo explica así **[arreglado]**.
- Riesgos / mitigaciones:
  - **[arreglado]** El paso `claim` devolvía el caption y los IDs de medios, que Inngest guarda (EE. UU.) → ahora solo IDs; el texto se lee dentro del paso de publicación.
  - URLs firmadas de 1 h para que Meta descargue los medios (necesario para su API); no se registran.
- Pendiente:
  1. Plazos: borrar los medios publicados a los [30] días (como dice `docs/ropa.md`) o cambiar el RoPA; definir conservación de `account_metrics_daily`.
  2. YouTube: comprobar cada ≤ 30 días que la autorización sigue vigente y, si no, borrar (ver módulo de cuentas).
  3. Firmar DPA de Inngest y verificar región.

## Analíticas y exportación CSV — 2026-11-19 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: ninguna en tiempo real (lee `account_metrics_daily` con RLS).
- Datos: no guarda nada nuevo; el CSV se genera al vuelo (`no-store`).
- Verificado: RLS (solo miembros del workspace); protección contra inyección de fórmulas en CSV (**[arreglado]**: añadidos tabulador y retorno de carro, OWASP).
- Riesgos / mitigaciones:
  - **[arreglado]** Los totales y las variaciones % sumaban YouTube con TikTok/Instagram: las YouTube Developer Policies prohíben
    combinar sus datos (III.E.2) y crear métricas derivadas (III.E.4.h) → YouTube queda fuera de totales y comparativas y se muestra solo por canal, con aviso.
  - "Publicadas con Kreo" es un dato propio: si se muestra junto a datos de YouTube, debe indicarse que no viene de YouTube.
- Pendiente: confirmar en la revisión de Google que el CSV de datos del propio canal es aceptable (las políticas no lo prohíben expresamente).

## IA: estudio de imagen (fal.ai, FLUX.1 schnell) y agente Guionista (Claude) — 2026-11-19 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: fal.ai (`fal-ai/flux/schnell`, API oficial, `enable_safety_checker: true`); Anthropic Messages API (`claude-opus-5-5`, salidas estructuradas).
- Licencias: FLUX.1 [schnell] **Apache 2.0** (uso comercial de modelo y resultados permitido) — se guarda en `ai_generations.license`
  y se muestra antes de generar. Claude: Anthropic Commercial Terms (el cliente es titular de los resultados; sin entrenamiento con datos de API por defecto — verificar retención).
- Datos guardados: `ai_generations` (prompt, modelo, coste, licencia, estado, autor) sin plazo de borrado definido; imágenes en
  `project-media` (privado) como `assets` con `ai_generated = true` (no desactivable).
- Verificado: la IA **solo propone** (los textos van al editor y siguen el flujo de aprobación; nada se publica ni se envía);
  cobro atómico e idempotente con reembolso si falla; palabras prohibidas del brand kit bloqueadas; al proveedor solo va el prompt y
  el contexto de marca (sin emails ni tokens); logs sin prompts; reglas comunes del agente (no prometer resultados, no automatizar
  engagement, marcar publicidad); aviso de no generar personas reales ni marcas de terceros.
- Riesgos:
  - **AI Act art. 50.2** (marcado legible por máquina del contenido sintético; aplicable desde el 02-08-2026, verificar si el
    "Digital Omnibus" lo ha aplazado): las imágenes de FLUX no llevan marca. Si Kreo es "proveedor" del sistema, debe marcarlas.
  - fal.ai devuelve las imágenes en URLs de su CDN (accesibles con el enlace) y no hay DPA firmado ni plazo de retención verificado.
  - Si se repite la petición con la misma clave de idempotencia, se cobra una vez pero se genera dos veces (coste para Kreo, no para el usuario).
  - Los textos sugeridos por la IA no activan la etiqueta IA: correcto para el art. 50.4 (texto con revisión humana y responsabilidad
    editorial) y para las plataformas (sus etiquetas se refieren a imagen/vídeo realista).
- Pendiente:
  1. Incrustar metadatos IPTC/XMP `DigitalSourceType = trainedAlgorithmicMedia` (y C2PA cuando sea viable) al guardar la imagen. **Decidir con el abogado.**
  2. DPA y condiciones de no-entrenamiento/retención de fal.ai y Anthropic; plazo de conservación de prompts (`ai_generations`).
  3. Cortar la segunda generación si la generación con esa clave ya no está en `running`.

> ⚖️ Recordatorio a Oier: un abogado debe revisar todos los textos legales (privacidad, términos, cookies, aviso legal,
> afiliados) y los avisos de la app que tienen efecto legal (YouTube, TikTok, IA, lista de espera) antes del lanzamiento público.

> ⚠️ **Pendiente (2026-11-19):** la migración `supabase/migrations/20261119120000_compliance_fixes.sql` está en el repo pero
> **todavía NO aplicada** en Supabase (la confirmación del conector caducó). Hasta aplicarla, la base de datos AÚN NO impone:
> la re-aprobación al editar destinos de un post aprobado, el 2FA dentro de las funciones y la etiqueta IA forzada por trigger
> (la app ya aplica las dos últimas a nivel de servidor). No hay cuentas reales conectadas, así que no hay riesgo práctico hoy.
> Aplicarla es el primer paso de la próxima sesión.
