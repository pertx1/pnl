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

> ✅ **2026-11-19:** migración `20261119120000_compliance_fixes.sql` aplicada en Supabase y verificada: editar un destino
> de un post programado lo devuelve a "pendiente de aprobación" y un admin puede volver a aprobarlo.

---

# Revisión de los módulos de las Fases 2-4 — 2026-11-19

Revisión de `seguridad-legal` leyendo el código de los commits 9aa35c3, 2d43ac5, 91ed86a, debd0dc y 4096b37 (notas detalladas
de cada módulo en `docs/compliance/{research,strategy,inbox,commerce,team}.md`). Correcciones pequeñas aplicadas directamente
(**[arreglado]**). SQL nuevo en `supabase/migrations/20261120150000_compliance_fixes_2.sql`: **NO aplicada**.
`npx tsc --noEmit` y `npx vitest run` (132 tests) en verde tras los cambios.

## Investigación (competencia, productos ganadores, inspiración) — 2026-11-19 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: YouTube Data API v3 (clave de API, datos públicos), Instagram Business Discovery (token de cuenta conectada,
  cabecera + `appsecret_proof`), Meta Ad Library API (token en cabecera; enlace público a la ficha, nunca `ad_snapshot_url`),
  oEmbed oficiales, Anthropic. TikTok: proveedor `none` (sin scraping).
- Permisos: ninguno nuevo (Business Discovery reutiliza `instagram_basic` + `pages_read_engagement`).
- Datos guardados: ver `docs/compliance/research.md`. YouTube: refresco ≤ 20 días y purga > 29 días (verificado en `research-retention`).
- Verificado: RLS + `mfa_required` en las 8 tablas; triggers de coherencia de workspace; zod; logs solo con códigos; backoff con
  `Retry-After`; métricas derivadas de YouTube desactivadas por defecto en la UI y en las alertas.
- Riesgos detectados y mitigaciones:
  - ⛔→**[arreglado]** El **Analista de IA** procesaba títulos y cifras de canales de YouTube ajenos y guardaba "insights"
    (III.E.2.b / III.E.4.h: datos derivados sin auditoría). Ahora `analyzeCompetitorAction` devuelve `youtube_derived_locked`
    para YouTube salvo `YOUTUBE_DERIVED_METRICS_APPROVED=true`, y el botón queda deshabilitado (mismo criterio que estrategia).
  - ⛔→**[arreglado]** El servidor MCP (`analyze_competitor`) devolvía la mediana, el "múltiplo vs. mediana" y el análisis de IA
    también para YouTube, saltándose el bloqueo de la UI → ahora solo los datos tal cual + enlaces a Términos de YouTube y Política de Google.
- Pendiente antes del lanzamiento:
  1. Logotipo oficial de YouTube (Branding Guidelines) donde se muestran sus datos (hoy etiqueta de texto).
  2. Declarar Business Discovery en App Review; confirmar con Meta que los términos de la **Ad Library API** permiten su uso en un SaaS comercial para terceros con un token de Oier.
  3. Política de privacidad: datos públicos de terceros (art. 14 RGPD), fuentes, plazos y derecho de oposición; LIA escrita.
  4. Avatares/miniaturas desde CDN de plataformas: mencionarlo o servirlos a través de Kreo.
  5. Auditoría de YouTube (III.L) si se quieren outliers/análisis de YouTube.

## Estrategia, planificador y calentamiento guiado — 2026-11-19 — Estado: ✅ aprobado (con un pendiente menor)
- APIs usadas: Anthropic (Estratega, Planificador, Coach); Resend para el recordatorio opcional. Ninguna API de plataformas.
- Verificado: todo crea **borradores** (nunca `pending_approval` ni programados); respeto de `daily_post_limit` y sin textos
  duplicados entre cuentas (revalidado en servidor); YouTube excluido de lo que se envía a la IA; el calentamiento es una checklist
  manual (ninguna acción automática en plataformas) y `sanitizeWarmupTasks` filtra bots/follow-unfollow/pods/compra de seguidores;
  cobro atómico con reembolso; RLS + `mfa_required` en las 5 tablas.
- Riesgos detectados y mitigaciones:
  - **[arreglado]** El recordatorio por email seguía llegando a quien había sido expulsado o había salido del workspace (con el @
    de la cuenta y el enlace) → `warmup-daily-check` comprueba la membresía y, si no la hay, apaga el recordatorio.
- Pendiente: plazo de conservación de prompts en `ai_generations` (común a toda la IA); recordatorio en el RoPA.

## Bandeja unificada, voz/música (ElevenLabs) y Clipper (fal) — 2026-11-19 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: Instagram Messaging (Send/Conversations/Webhooks), Gmail API, Microsoft Graph Mail, Anthropic, ElevenLabs
  (TTS con voces por defecto, Eleven Music con C2PA), fal.ai (Whisper, trim/scale/auto-subtitle).
- Scopes: Meta `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`, `pages_show_list`; Google `gmail.readonly`
  (restringido) + `gmail.send`; Microsoft `Mail.Read`, `Mail.Send`, `offline_access`, `openid email`. Justificados en la nota del módulo.
- Verificado:
  - Webhook de Meta con `X-Hub-Signature-256` (HMAC del cuerpo crudo, tiempo constante) y verify token; inserción idempotente.
  - **Envío solo con clic humano**, un intento, destinatario derivado del hilo (no editable, sin CC/BCC), solo hilos con mensaje
    entrante, máx. 30/h por conexión; **ventana de 24 h** de Instagram en servidor (HUMAN_AGENT solo con flag aprobado).
  - OAuth con estado firmado + PKCE; rol editor revalidado a la vuelta; tokens cifrados en tabla sin políticas; tokens de Meta en
    cabecera + `appsecret_proof`; revocación al desconectar (Google; baja de webhook en Meta).
  - Retención: mensajes 30 días (`expires_at` + purga diaria), hilos sin actividad 30 días, borradores 30 días; logs solo con códigos;
    la sugerencia de IA no guarda el contenido en `ai_generations`.
  - Audio/Clipper: cobro atómico e idempotente con reembolso; audio marcado `ai_generated` (no desactivable); casilla de derechos en Clipper.
- Riesgos / pendiente antes del lanzamiento:
  1. **Gmail**: verificación de Google de scope restringido + **CASA anual** (coste → decisión de Oier) y declarar en la verificación
     y en la privacidad el envío del hilo a Anthropic al pedir sugerencia (Limited Use). Hasta entonces, solo modo Testing.
  2. Meta App Review (`instagram_manage_messages`, `pages_manage_metadata`, Human Agent) + callbacks de desautorización y eliminación de datos.
  3. Microsoft: Publisher verification.
  4. DPA con clientes (Kreo encargado de los mensajes), **EIPD** (IA + mensajería), Anthropic/ElevenLabs/fal en subencargados con SCC.
  5. ElevenLabs: plan de pago (licencia comercial) y retención/`enable_logging`; voz TTS sin marca legible por máquina (AI Act art. 50.2, decidir con el abogado).
  6. fal: DPA y plazo de retención de los intermedios en su CDN (el vídeo del usuario se envía con URL firmada de 6 h).
  7. Clipper: dos clics simultáneos en "Generar" sobre el mismo momento pueden cobrar dos renders (el estado no se reclama de forma
     atómica antes del cobro). No es un fallo legal, pero conviene arreglarlo antes del lanzamiento.

## Shopify, informes PDF de marca blanca y servidor MCP — 2026-11-19 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: Shopify OAuth (authorization code, token offline caducable) + Admin GraphQL `2026-10` + webhooks HMAC; Resend; SDK
  oficial MCP (Streamable HTTP, sin estado); Anthropic (`draft_reply`).
- Scopes Shopify: `read_orders`, `read_products`, `read_discounts`, `write_discounts` (mínimos; sin `read_all_orders` ni campos de cliente).
- Verificado:
  - Webhooks de Shopify: HMAC base64 del cuerpo crudo en tiempo constante (401 si falla); los 3 obligatorios RGPD + `app/uninstalled`
    (borra tokens al momento); pedidos minimizados con lista blanca + `includeFields` (sin nombre, email, teléfono, dirección ni id de cliente).
  - OAuth: estado firmado ligado a proyecto + tienda, HMAC de la query, dominio `*.myshopify.com` anclado, rol editor revalidado,
    una tienda ↔ un proyecto (no se puede "robar" una tienda vinculada a otro workspace).
  - Informes: casilla de consentimiento de destinatarios, remitente identificado, **baja en un clic** (RFC 8058, GET con confirmación),
    lista de bajas por hash que un trigger impide re-añadir, enlace firmado de 14 días que muere al pausar/borrar; PDF no se guarda.
  - MCP: API key de 256 bits, solo hash en BD, alta/revocación con aal2; rol comprobado en cada herramienta (`member_role`);
    `create_draft_post` nunca aprueba ni publica; `draft_reply` nunca envía; cobro atómico e idempotente con reembolso; 60/min y
    2.000/día por clave; validación de `Origin`.
- Riesgos detectados y mitigaciones:
  - ⛔→**[arreglado]** `analyze_competitor` exponía métricas derivadas y análisis IA de YouTube (ver Investigación).
  - **[arreglado]** `draft_reply` guardaba el mensaje del tercero en `ai_generations.prompt` (sin plazo de borrado) → ahora solo una etiqueta.
- Pendiente antes del lanzamiento:
  1. Shopify: solicitar **protected customer data nivel 1** y configurar `compliance_topics`; plazo de `shopify_orders` en el RoPA.
  2. **YouTube en informes enviados a terceros** y en el MCP (datos del canal del usuario que salen hacia clientes/asistentes externos):
     confirmar con el abogado y en la revisión de Google; mientras tanto, añadir al texto de conexión de YouTube que los datos pueden
     incluirse en informes y en el MCP si el usuario lo activa, e incluir en el PDF la atribución de YouTube.
  3. "Enviar ahora" permite un envío cada 10 min a terceros; recomendado máx. 1 manual al día por programación.
  4. Proveedor de email UE con DPA; política de privacidad: MCP (datos hacia el cliente de IA que elige el usuario) e informes.
  5. OAuth 2.1 para el conector MCP y caducidad opcional de las claves.

## Equipo, planes/suscripción y afiliados — 2026-11-19 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: Stripe (Checkout subscription, Billing Portal, webhooks firmados), Resend (invitaciones).
- Verificado: webhook de Stripe con `constructEvent` (firma) y estado leído siempre de la API; créditos mensuales idempotentes
  (`plan_invoice:<id>`); `plan_id` solo por `service_role`; todas las funciones `SECURITY DEFINER` con `search_path` vacío y grants
  mínimos; invitaciones con hash, 7 días, ligadas al email, 30/24 h por workspace; el afiliado solo ve agregados (referidos sin políticas RLS);
  `/r/<código>` sin IP/UA, cookie `kreo_ref` **solo con consentimiento de marketing** (revalidado al usarla), prefetch no cuenta;
  sin comisión por autorreferido o miembro del workspace; reembolso/contracargo anulan la comisión; recordatorio de #ad en el panel.
- Riesgos detectados y mitigaciones:
  - **[arreglado, migración pendiente]** `accept_invitation` no exigía email confirmado: si alguna vez se desactiva la confirmación
    en Supabase Auth, alguien podría registrarse con el email invitado y entrar con el enlace → ahora exige `email_confirmed_at`
    (`20261120150000_compliance_fixes_2.sql`).
- Pendiente antes del lanzamiento:
  1. **Aplicar** `20261120130000_team.sql` (no aplicada) y `20261120150000_compliance_fixes_2.sql`, y pasar `get_advisors`.
  2. Borrar la cuenta de un afiliado borra en cascada sus comisiones: hay obligación de conservar 6 años (art. 30 CCom) → decidir
     con el abogado (anonimizar en lugar de borrar) antes de pagar la primera comisión.
  3. Personal que marca comisiones como pagadas (`KREO_STAFF_EMAILS`): exigir 2FA obligatoria, no solo "si la tiene".
  4. Límite global de invitaciones por usuario (hoy 30/24 h por workspace; se puede multiplicar creando workspaces).
  5. Desistimiento (incl. función de desistimiento de la Directiva 2023/2673), términos de afiliados, fiscalidad de comisiones y
     transparencia hacia los referidos: revisión del abogado. Política de cookies: `kreo_ref` (marketing, 30 días).

> ⚖️ Recordatorio a Oier: **un abogado debe revisar todos los textos legales** (privacidad, términos, cookies, aviso legal,
> afiliados, DPA para clientes) y los avisos con efecto legal de estos módulos (bandeja/Gmail, informes a terceros, afiliados,
> suscripciones) **antes del lanzamiento público**.

## MCP · OAuth 2.1 para conectores de Claude + herramientas "cerebro" — 2026-11-23 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: ninguna de plataformas sociales nueva. fal.ai (ya existente) vía generate_image/generate_video. Descarga de
  Client ID Metadata Documents SOLO de hosts permitidos (`MCP_CIMD_ALLOWED_HOSTS`, por defecto claude.ai y claude.com).
- Especificación: MCP 2026-07-28 (Authorization) y guía de conectores de Claude: OAuth 2.1 + PKCE S256, RFC 9728, RFC 8414,
  CIMD y DCR (RFC 7591), RFC 8707 (`resource`), RFC 9207 (`iss`), RFC 7009 (revocación). Se descartó Supabase OAuth Server
  (emite JWT de Supabase utilizables contra su API REST, sin CIMD ni `resource`, sin ligar a un workspace).
- Permisos: un scope `kreo`, ligado a usuario + UN workspace (elegido en el consentimiento) + cliente + recurso. Mismos roles
  y reglas que la app (lector lee; editor crea borradores/tareas/IA). Nada se aprueba, publica ni envía desde el MCP.
- Datos guardados: hash SHA-256 de códigos (5 min, un uso), tokens de acceso (1 h) y refresco (30 días, rotatorios); nombre
  autodeclarado del cliente y host de su redirect URI; límites por usuario o por HMAC truncado de la IP (se borran a los 2 días).
  Ningún token en claro; tablas solo service_role salvo "apps conectadas" (cada usuario ve y revoca las suyas). 2FA exigida.
- Mitigaciones: redirect URI exacta (puerto libre solo en loopback), https o loopback; sin redirección si cliente/URI no
  válidos; consentimiento con host de vuelta y aviso para loopback; anti-clickjacking (`frame-ancestors 'none'`);
  reutilización de código o de refresh rotado → revocación; auditoría en activity_log (`via: mcp_oauth`).
- Revisión `seguridad-legal` (2026-11-23, commit 4e76996). Verificado sin cambios: PKCE S256 obligatorio con comparación en
  tiempo constante; código de un uso ligado a cliente + redirect_uri + challenge + recurso, y su reutilización revoca la
  autorización; rotación de refresh con detección de reutilización; audiencia comprobada en cada petición al MCP; membresía
  revalidada en cada token; sin open redirect (error en página propia si cliente/URI no válidos); parámetros repetidos rechazados;
  la cookie de la petición pendiente se revalida entera y "Permitir" va ligado a su resumen; consentimiento con sesión + 2FA (aal2,
  también en la función SQL); `frame-ancestors 'none'`; `safeNext` solo admite `/app…` y `/oauth/consent`; RLS en las 5 tablas
  (solo el dueño ve sus apps conectadas) y funciones `SECURITY DEFINER` con `search_path` vacío y grants mínimos; SSRF de CIMD
  acotado por lista cerrada de hosts (https, sin puerto ni credenciales, sin redirecciones, 5 s); loopback con puerto libre conforme
  a RFC 8252 y aviso en el consentimiento; `create_draft_post` nunca aprueba ni publica (como mucho `pending_approval`, y la
  aprobación sigue siendo humana vía `approve_post`, rol admin, con límite diario y cuenta activa); `draft_reply` nunca envía;
  cada herramienta comprueba el rol con `member_role`; `ai_generated` del post se hereda de los medios (etiqueta IA).
- Hallazgos y arreglos (sin commit):
  - **[media · arreglado]** Phishing de consentimiento: el nombre de un cliente DCR lo escribe quien lo registra y salía como título
    («X quiere acceder…»). Ahora, si no viene de un CIMD verificado por dominio, el título dice «Una app que dice llamarse «X»…» con
    la marca «nombre no verificado» y el aviso en color de advertencia (`src/app/oauth/consent/page.tsx`, `messages/modules/mcp/*.json`).
  - **[media · arreglado]** Retención: la limpieza perezosa solo borraba filas del mismo sujeto/autorización, así que los límites
    por IP (hash) de otros sujetos, los tokens caducados de autorizaciones que no refrescan y las autorizaciones revocadas se
    quedaban para siempre (la documentación prometía 2 días). Nueva limpieza diaria en `data-retention`
    (`src/lib/mcp/oauth-retention.ts`): límites 10 min / 2 días, códigos y tokens caducados > 1 día, autorizaciones revocadas > 30 días
    y abandonadas (sin tokens vigentes). **Depende de que Inngest esté conectado** (pendiente de Oier).
  - **[media · arreglado]** RGPD: la exportación no incluía apps conectadas ni API keys → añadidas (solo metadatos, nunca hashes)
    en `src/app/app/settings/export/route.ts`. Política de privacidad (es/en): nuevo apartado 6.1 «Asistentes de IA que conectas»
    y fila en plazos de conservación (borrador, para el abogado).
  - **[media · arreglado en texto, pendiente de producto]** `generate_image`/`generate_video` gastan créditos sin confirmación dentro
    de Kreo (solo la del cliente de IA, si el usuario no la ha desactivado). No choca con la regla nº 1 (nada se publica), pero el
    consentimiento prometía «siempre te dirá el coste», cosa que Kreo no puede garantizar → texto corregido. Recomendado: interruptor
    por autorización «permitir gastar créditos» (desactivado por defecto) y tope diario de créditos vía MCP.
  - **[baja · arreglado]** `get_free_slots` calculaba el hueco por día local pero `approve_post` comprueba el límite por día UTC:
    podía sugerir una hora que luego no se aprueba. Ahora `remaining`/`suggested_time` también respetan el día UTC de la hora
    sugerida y la consulta se amplía ±1 día (`src/lib/mcp/calendar.ts`, `server.ts`, test nuevo en `tests/unit/mcp-calendar.test.ts`).
  - **[baja · arreglado]** `/oauth/token`: `client_id` mal %-codificado en `Authorization: Basic` daba 500 → ahora `invalid_request`.
  - **[baja · arreglado]** CIMD: se descarta la respuesta si `Content-Length` > 10 KB antes de leer el cuerpo.
  - **[baja · aceptado]** Límites por IP compartida (Claude sale por rangos compartidos): 600/min en token y 60/min en registro son
    holgados y solo antiabuso; el límite real es por usuario (60/min, 2.000/día). Si la RPC falla el límite no bloquea (fail-open).
  - **[baja · aceptado]** CIMD acepta cualquier ruta de `claude.ai`/`claude.com`; riesgo bajo porque esos hosts no sirven JSON
    arbitrario de usuarios. Si Anthropic publica la ruta exacta del documento, fijarla.
- Pendiente antes del lanzamiento:
  1. **Datos de plataformas hacia el asistente de IA** (métricas de YouTube/Instagram vía `get_project_stats`): es una
     transferencia a petición del usuario, pero hay que declararla en las revisiones de Google (Limited Use / YouTube API Services)
     y Meta, y confirmarla con el abogado. Si Google o Meta la rechazan, excluir sus métricas del MCP.
  2. Interruptor y tope diario de gasto de créditos por app conectada (ver arriba).
  3. Definir `MCP_OAUTH_RATE_SALT` en Vercel (secreto propio, no derivado de la clave de Supabase).
  4. Conectar Inngest para que corra `data-retention`.
  5. Abogado: revisar el apartado 6.1 de la política de privacidad y el punto 15 de los términos.

- **2026-11-23 · MCP — gasto de créditos**: resuelto el hallazgo 4 de la revisión del conector. Las herramientas que gastan créditos (generate_image, generate_video, draft_reply) exigen el interruptor «permitir gastar créditos» de cada conexión (apagado por defecto) y un tope diario atómico (`mcp_credit_reserve`, migración `20261123180000_mcp_credit_policy.sql`).

## Centro de avisos, mejores horas, resumen semanal y subtítulos de YouTube — 2026-11-24 — Estado: ⚠️ revisado (ver «Revisión del 2026-11-24» abajo)
- APIs usadas: YouTube Data API `captions.insert` (scope `youtube.force-ssl`, ya pedido; 400 unidades de cuota por subida). Nada nuevo en Meta/TikTok.
- Datos guardados: `notifications` (por usuario: tipo, título y cuerpo cortos con el título propio de la publicación y el @ de la
  cuenta propia, enlace interno, IDs; el resumen semanal guarda contadores, @ propios, títulos de publicaciones y tareas del proyecto).
  Sin tokens, mensajes ni datos de terceros. `notification_preferences` (tipos desactivados). RLS: cada usuario ve/borra solo los suyos
  y solo mientras sea miembro del workspace; al salir del workspace se borran. Leídos > 90 días y cualquiera > 1 año: borrado diario.
  Incluidos en la exportación RGPD.
- YouTube: «Mejores horas» NO usa datos de la API de YouTube (solo patrón orientativo); el resumen semanal muestra los suscriptores
  por canal tal cual, sin variación ni sumas con otras redes (Developer Policies III.E.4).
- Patrón por defecto de mejores horas marcado como «orientativo» con fuentes citadas en `src/lib/analytics/best-time.ts`.
- Email: no se envía nada (falta dominio y proveedor UE con DPA).
- Para revisar: base legal del resumen semanal a todos los miembros del workspace (incluidos lectores); texto de la política de
  privacidad (avisos dentro de la app y plazos 90 días / 1 año).
## Clipper v2 (viralidad, formatos, plantillas de subtítulos, editar y «Programar clips») — 2026-11-24 — Estado: ⚠️ revisado (ver «Revisión del 2026-11-24» abajo)
- Modelos (todos `license_type = "commercial"` en la API de modelos de fal.ai, comprobado el 2026-11-23; registrados en
  `CLIPPER_LICENSE` de `src/lib/clipper/pipeline.ts` y en cada `ai_generations.license`):
  `fal-ai/whisper`, `fal-ai/workflow-utilities/trim-video`, `fal-ai/workflow-utilities/scale-video`,
  `fal-ai/workflow-utilities/auto-subtitle` (transcribe con ElevenLabs a través de fal → subencargado a declarar). Textos: Claude
  (Anthropic Commercial Terms).
- Descartados: reencuadres generativos de fal (`fal-ai/ltx-2.3/reframe`, `lightricks/ltx-2.5/reframe`, `luma/.../reframe`,
  `minimax/h3-max/reframe-video`, `wan-vace`): no siguen a la persona, rellenan con píxeles inventados alrededor de una persona
  real (contenido sintético) y cuestan más. `veed/subtitles` (título-gancho vía SRT): tercero adicional, coste mínimo de 1 min y
  sin confirmar que no añada marca de agua → no se usa sin decisión de Oier.
- Verificado en código:
  - Solo vídeo propio subido por el usuario (casilla de derechos; ninguna descarga por enlace de YouTube/TikTok). Límite de 50 MB
    del bucket (plan gratis de Supabase) avisado en la UI.
  - **Sin marca de agua**: lista cerrada de 4 endpoints y parámetros sin ninguna capa extra; test «sin marca de agua» en
    `tests/unit/clipper-v2.test.ts`.
  - Créditos: coste visible antes de lanzar (render, re-render y textos); cobro atómico (`start_ai_generation`); reembolso si falla.
    **Arreglado el riesgo 7 de la revisión anterior**: el segmento se reclama de forma atómica (`status` esperado) ANTES de cobrar,
    así que dos clics simultáneos ya no cobran dos renders.
  - «Programar clips» crea BORRADORES (o `pending_approval` si el usuario lo marca y cumple `validateTarget`; TikTok siempre queda en
    borrador porque la privacidad la elige una persona). Nunca aprueba ni publica. Huecos con `computeFreeSlots` (límite diario por
    cuenta y día UTC) y textos distintos por red (anti-duplicado). Al agente solo van título, gancho y extracto de la transcripción.
  - `ai_generated` del post según los medios (los clips de vídeo propio no son sintéticos → `false`; el trigger `posts_ai_label` lo
    fuerza si algún medio es IA).
  - Puntuación de viralidad: se presenta como potencial relativo dentro del vídeo, nunca como predicción («no prometer resultados»).
  - `.srt` del clip en `clip_segments.srt` (RLS existente + `mfa_required`).
- Migración `20261124100000_clipper_v2.sql` (sin tablas nuevas; columnas en `clip_segments` y guard actualizado). Aplicada.
- Pendiente: revisión `seguridad-legal`; declarar ElevenLabs (vía fal) como subencargado del audio de los clips; DPA con fal.
## YouTube · subida directa navegador → YouTube (vídeos grandes) — 2026-11-23 — Estado: ⚠️ revisado (ver «Revisión del 2026-11-24» abajo)
- APIs usadas: YouTube Data API v3 oficial. `videos.insert` con el protocolo de subida reanudable (sesión abierta por el
  servidor, bytes enviados por el navegador), `videos.list` (comprobar que el vídeo existe y es del canal), y los pasos
  opcionales que ya hacía el worker (`thumbnails.set`, `playlistItems.insert`). Programación nativa con `status.publishAt`.
- Permisos / scopes: ninguno nuevo (`youtube.upload` para subir; `youtube.readonly`/`youtube.force-ssl` ya concedidos para
  leer el vídeo, miniatura y listas).
- Datos guardados: en `post_targets.platform_options.yt_direct_upload` solo nombre, tamaño y tipo del archivo (lo que se
  aprobó). El vídeo NO pasa por Kreo ni se guarda en Storage. Id y URL del vídeo como en cualquier publicación.
- Regla nº 1: la subida solo la lanza un admin/owner con «Aprobar y subir a YouTube», que llama a `approve_post` (aprobación
  humana, límite diario anti-baneo, cuenta activa) ANTES de abrir la sesión. El servidor vuelve a comprobar rol, aprobación,
  destino YouTube y que tamaño/tipo coinciden con lo aprobado (otro archivo = volver a aprobar). El worker de Inngest nunca
  reclama estos destinos (`platform_options->>yt_direct_upload is null`). Etiqueta IA: `containsSyntheticMedia` = `ai_generated`.
- Riesgos aceptados:
  - **URL de sesión en el navegador**: el access token nunca sale del servidor, pero la URL de la sesión reanudable sí llega
    al navegador de quien aprueba. Esa URL solo permite subir los bytes de ESE vídeo, con los metadatos ya fijados por el
    servidor, al canal conectado, y caduca sola. No da acceso de lectura ni a otras acciones. Se entrega solo a admin/owner
    del workspace y no se guarda en ninguna parte. (Google Cloud Storage documenta lo mismo para sus URLs de sesión:
    tratarlas como secreto.)
  - **CORS**: el servidor abre la sesión con la cabecera `Origin` = `appUrl()` para que los PUT del navegador pasen CORS. La guía
    de YouTube no lo documenta (sí la de Google Cloud Storage para su protocolo reanudable): verificar en la prueba manual.
  - Doble subida si dos admins lanzan a la vez la subida del mismo destino (no hay bloqueo): el segundo `complete` se rechaza
    con `already_uploaded` y quedaría un vídeo duplicado en YouTube (borrar en YouTube Studio). Riesgo bajo (acción manual).
  - Si se cierra la pestaña a mitad, no se crea vídeo (YouTube solo lo crea al completar) y el destino sigue «programado»
    sin que el worker lo toque: hay que volver a elegir el archivo y subir.
- Estado nuevo `scheduled_on_platform` («Programado en YouTube»): bloquea la edición en Kreo (se gestiona en YouTube Studio),
  cuenta para el límite diario y el worker lo pasa a `published` al llegar la hora. Migración `20261124140000_youtube_direct.sql`
  (sin aplicar).

---

# Revisión del 2026-11-24 — lo fusionado en `main` (`01ad539..9d2d7ec`)

Revisión del subagente `seguridad-legal` sobre el código (migraciones `20261124*` ya aplicadas en producción). Arreglos sin
commit; una migración nueva **sin aplicar**: `20261124150000_security_fixes.sql` (solo limpia datos, sin cambios de esquema).
Comprobado con `npx tsc --noEmit`, `npx eslint` sobre lo tocado y `npx vitest run` (290 tests en verde).

> ⚖️ Recordatorio: un abogado debe revisar los textos legales (privacidad, términos, cookies, aviso legal, afiliados) antes
> del lanzamiento público. En esta revisión se han tocado los borradores de privacidad (es/en) y `docs/subprocessors.md`.

## Clipper v2 — 2026-11-24 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: fal.ai (`fal-ai/whisper`, `workflow-utilities/trim-video`, `scale-video`, `auto-subtitle`); Anthropic para los textos por red.
- Permisos: rol editor (RLS + `has_workspace_role`); 2FA por la política `mfa_required` de `clip_segments`.
- Datos guardados: columnas nuevas en `clip_segments` (desglose de puntuación, opciones de render, `.srt` ≤ 200 KB); RLS existente.
- Verificado: licencias comerciales registradas en cada `ai_generations.license`; sin marca de agua (lista cerrada de 4 endpoints,
  con test); solo vídeo propio con casilla de derechos; reclamo atómico del segmento ANTES del cobro (sin doble cobro) y reembolso
  en todos los caminos de fallo (`failSegment`, tiempo máximo por paso, barrido de Inngest cada 2 min); los textos de «Programar
  clips» se cobran con clave de idempotencia y se reembolsan si fallan. «Programar clips» crea BORRADORES con RLS del usuario y
  como mucho llama a `submit_post` (pendiente de aprobación) si cumple `validateTarget`; con TikTok siempre queda en borrador.
  Nunca aprueba ni publica. Límite diario por cuenta y día UTC vía `computeFreeSlots`. La guarda SQL impide que un editor toque
  estado, `.srt`, puntuación u opciones desde el navegador.
- Hallazgos:
  - **[media · arreglado en texto]** ElevenLabs trata el audio de los clips como subencargado ulterior de fal (`auto-subtitle`):
    añadido en `docs/subprocessors.md` y en la política de privacidad (es/en, apartados 6 y 8). Falta el DPA de fal y su lista
    de subencargados.
  - **[baja · pendiente]** Carrera de milisegundos entre el reclamo y la escritura de `generation_id`: si el barrido de Inngest
    entra justo ahí y luego el cobro falla, se lanza un recorte en fal sin cobro (coste para Kreo, no para el usuario).
    Propuesta: marcar `render_step = 'charging'` en el reclamo y que `advanceSegment` lo ignore.
  - **[info]** Los textos por red los escribe Claude; el post se marca IA solo si los medios lo son (mismo criterio que el resto
    de la app y que las plataformas, que etiquetan medios sintéticos, no texto).

## Plantillas, series y textos guardados — 2026-11-24 — Estado: ✅ aprobado
- APIs usadas: ninguna externa.
- Datos guardados: `post_templates`, `post_snippets`, `post_series` (RLS lectura viewer / escritura editor + `mfa_required`);
  `posts.series_id`. Se borran con el proyecto/workspace.
- Verificado: TikTok — las plantillas no guardan NADA de TikTok (código + `check (not (platform_options ? 'tiktok'))`), así que
  privacidad, interacciones y divulgación comercial se eligen en cada publicación (Content Sharing Guidelines). Las series solo
  crean borradores o, si cumplen las reglas, pendientes vía `submit_posts` → `submit_post` (editor, estado borrador); nunca
  aprueban. Como las series no llevan medios, Instagram/TikTok/YouTube quedan siempre en borrador. Fechas calculadas en servidor,
  límite diario por día local y UTC, mismo texto en ≥ 3 cuentas → borrador (anti-duplicado). Triggers de coherencia
  proyecto/cuentas/serie.

## Avisos, mejores horas, resumen semanal y subtítulos de YouTube — 2026-11-24 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: YouTube Data API `captions.insert` (scope `youtube.force-ssl`, ya concedido).
- Datos guardados: `notifications` y `notification_preferences` (RLS por usuario + miembro del workspace + `mfa_required`;
  sin política de INSERT/UPDATE para el navegador; borrado diario: leídos > 90 días, cualquiera > 1 año; purga al salir del
  workspace; en la exportación RGPD).
- Verificado: mejores horas no usa datos de YouTube (solo patrón orientativo con fuentes citadas); TikTok/Instagram con datos
  de las cuentas propias. Enlaces de avisos solo internos (`check` en BD). Email: no se envía nada.
- Hallazgos:
  - **[media · arreglado]** El aviso `weekly_summary` guardaba nombre del canal y suscriptores de YouTube hasta 1 año, y no se
    borraban al desconectar: choca con YouTube Developer Policies III.E.4.c (refrescar o borrar en 30 días) y III.D.2 (borrar en
    7 días tras revocar). Ahora se guarda solo el id de la cuenta y la página del aviso lee canal y cifra en vivo con RLS; si la
    cuenta ya no existe, YouTube desaparece del resumen (`stripYouTubeData` / `hydrateYouTube` en
    `src/lib/notifications/weekly-core.ts`, `weekly.ts`, `src/app/app/(shell)/notifications/[id]/page.tsx`, tests nuevos).
    Migración `20261124150000_security_fixes.sql` limpia los avisos ya creados. **Aplicar.**
  - **[media · arreglado]** Subtítulos: se subían públicos sin que nadie los viera (transcripción automática del vídeo fuente) y
    el `.srt` editado/incrustado del clip se ignoraba. Ahora: `.srt` subido por la persona o el del clip con subtítulos
    incrustados (lo que ya se ve en el vídeo aprobado) → públicos; transcripciones sin revisar → `isDraft: true` (borrador en
    YouTube Studio; regla nº 1). Archivos: `src/lib/social/captions.ts`, `publish.ts`, `src/inngest/functions.ts`.
  - **[baja · arreglado]** El paso `list-projects` del cron semanal devolvía nombres de proyecto (se guardan en Inngest, EE. UU.):
    ahora solo IDs (`src/inngest/modules/notifications.ts`).
  - **[decisión · aceptado]** Resumen semanal a lectores: es la misma información que ya pueden ver en la app con su rol (RLS
    viewer), solo dentro de la app, desactivable por tipo en Ajustes y borrada al salir del workspace. Base legal: ejecución del
    contrato (6.1.b) con el titular del workspace / interés legítimo (6.1.f) para los miembros. Correcto mientras sea in-app;
    **si se envía por email**, hará falta preferencia de email aparte (desactivada por defecto para lectores), baja en un clic y
    proveedor UE con DPA.
  - **[baja · pendiente]** Los avisos `post_published`/`post_failed`/`youtube_consent_expiring` de YouTube llevan el @ del canal
    en el texto (hasta 1 año). Es el nombre propio del canal del usuario, pero para cumplir III.D.2 al pie de la letra conviene
    borrar los avisos que referencian una cuenta al desconectarla.
  - **[pendiente · producto]** Mostrar en el editor (YouTube) que se subirán subtítulos y de dónde salen, con opción de no subirlos.
  - Plazos de avisos (90 días / 1 año) añadidos a la tabla de conservación de la política de privacidad (es/en).

## YouTube · subida directa navegador → YouTube — 2026-11-24 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: YouTube Data API v3 oficial (`videos.insert` reanudable, `videos.list`, `thumbnails.set`, `playlistItems.insert`).
- Permisos: sin scopes nuevos.
- Verificado: el access token nunca sale del servidor; la sesión solo se abre para admin/owner, con post aprobado
  (`approved_by` + estado), destino YouTube activo y archivo idéntico (nombre/tamaño/tipo) al aprobado; cambiar el archivo
  dispara reaprobación (`guard_target_status`). Metadatos (incl. `containsSyntheticMedia`) fijados por el servidor. La URL de
  sesión se valida (`https`, `*.googleapis.com`, `/upload/`), no se guarda ni se registra. `complete` comprueba con `videos.list`
  que el vídeo es del canal conectado. El worker nunca reclama estos destinos. Nuevo estado `scheduled_on_platform` bloqueado y
  contado en el límite diario.
- Riesgos aceptados: URL de sesión en el navegador del admin (solo sube ESE vídeo; tratar como secreto); CORS no documentado por
  YouTube (verificar en la prueba real); posible vídeo duplicado si dos admins suben a la vez.
- Pendiente (baja): un post con YouTube directo + otras redes queda «publicando» si nadie sube el vídeo; un admin puede asociar
  cualquier vídeo existente de SU canal con `complete` (impacto bajo). Explicar en la UI que con privacidad no pública o fecha
  inminente el vídeo se sube ya.

## Conector MCP · update_draft_post, subidas, mejores horas y resumen — 2026-11-24 — Estado: ⚠️ aprobado con condiciones
- APIs usadas: Supabase Storage (`createSignedUploadUrl`, 2 h) — ninguna de plataformas.
- Verificado: ninguna herramienta aprueba ni publica (como mucho `pending_approval` con `validateTarget`); rol editor y
  workspace autorizado comprobados con `projectFor`; `finish_media_upload` solo acepta rutas `{workspace}/{proyecto}/{uuid}.{ext}`
  del proyecto autorizado (no se puede registrar un archivo de otro workspace); la URL firmada no sobrescribe (sin upsert) y el
  bucket limita tamaño y tipos; miniatura de YouTube validada en el mismo proyecto; `get_best_times` sin datos de YouTube.
- Hallazgos:
  - **[media · arreglado]** TikTok: el asistente podía fijar `privacy_level` y enviar a aprobación, saltándose que la privacidad
    la elija la persona sin valor por defecto (Content Sharing Guidelines) y contradiciendo al Clipper y a las plantillas. Se
    quita `privacy_level` del esquema MCP: con TikTok el borrador queda en borrador hasta que una persona elige la privacidad en
    el editor (`src/lib/mcp/post-options.ts`, descripciones en `server.ts`, test en `tests/unit/mcp-post-options.test.ts`).
  - **[media · arreglado]** `update_draft_post` usa el cliente de servicio (salta `guard_post_status`): si un admin aprobaba entre
    la lectura y la escritura, el MCP devolvía a borrador un post aprobado dejando `approved_by`. Ahora la escritura exige
    estado `draft`/`pending_approval` y, si no, devuelve `not_editable`.
  - **[baja · arreglado]** `finish_media_upload` aceptaba cualquier contenido con la extensión del `upload_id` (p. ej. un `.srt`
    o HTML subido con nombre `.mp4`). Ahora exige que el `Content-Type` subido coincida y que no pase de 50 MB; si no, borra el
    archivo y falla.
  - **[pendiente · ya registrado]** `get_weekly_summary` y `get_project_stats` entregan métricas de YouTube/Instagram al
    asistente de IA: declararlo en las revisiones de Google y Meta (punto 1 de la revisión MCP del 2026-11-23).
  - **[baja · pendiente]** En `update_draft_post` las cuentas se validan después de actualizar el post: si son inválidas, el texto
    ya se ha guardado (sin riesgo de publicación; solo coherencia).

## Instagram · reel de prueba (`trial_params`) — 2026-11-24 — Estado: ✅ aprobado
- API oficial de publicación de contenido (`trial_params.graduation_strategy` = `MANUAL` | `SS_PERFORMANCE`), solo con un único
  vídeo (regla `instagram_trial_requires_single_video`). Desactivado por defecto; lo elige la persona y la aprobación sigue
  siendo humana. La divulgación IA del caption no cambia. Sin datos nuevos.

## Panel del proyecto rediseñado — 2026-11-24 — Estado: ✅ aprobado (con un arreglo)
- Lee con RLS. Verificado: el total combinado excluye YouTube (`combinedTotals`) y YouTube no muestra variaciones.
- **[baja · arreglado]** La tarjeta de YouTube mostraba una línea de evolución de suscriptores (una variación visual, métrica
  derivada): quitada. «Publicación · 30 días» mezcla destinos de todas las redes, que son datos de Kreo: la nota lo dice ahora
  («Datos de Kreo (no de las plataformas)»), como pide la revisión de Analíticas.

## TikTok · borradores (inbox), «subir a mano» y Content Sharing Guidelines — 2026-11-25 — Estado: ⏳ pendiente de `seguridad-legal`
- APIs usadas (oficiales, OAuth oficial): Content Posting API · Upload `POST /v2/post/publish/inbox/video/init/` (scope
  `video.upload`, nuevo), `POST /v2/post/publish/status/fetch/` y `POST /v2/post/publish/creator_info/query/` (`video.publish`).
  Nada de navegador automatizado, cookies de sesión ni librerías no oficiales.
- Sin auditoría de Direct Post el modo por defecto es «Enviar a mis borradores de TikTok»: el creador termina y publica en la
  app de TikTok (elige privacidad, texto, etiquetas). Si la API no se puede usar, Kreo solo prepara el vídeo (URL firmada de
  1 h, solo miembros del proyecto) y el texto: la subida la hace la persona a mano. Ninguna acción de engagement.
- Consentimiento expreso por cuenta (`tiktok_consent`, validado en servidor) + aprobación humana. El MCP no puede marcarlo y
  lo borra al modificar un borrador.
- **Etiqueta IA**: la API de inbox no acepta `is_aigc` ni título → recordatorio obligatorio (editor, aviso y página de pasos)
  para activar «Contenido generado por IA» en TikTok. En Direct Post sigue siendo automática y no desactivable. Revisar si
  basta o si conviene bloquear borradores con IA hasta la auditoría.
- Datos nuevos: `creator_info` (nickname, @, avatar, privacidades, ajustes de interacción, duración máxima) se lee al abrir
  el editor y **no se guarda**; el avatar se carga desde el CDN de TikTok (igual que en Cuentas). El `publish_id` de TikTok se
  guarda en `post_targets.external_post_id`. Aviso nuevo `post_action_needed` (borrado con los demás a los 90 días).
- Retención del sondeo: `status/fetch` solo durante 7 días desde el envío.
- Pendiente: textos de privacidad (scope `video.upload`), revisión `seguridad-legal`, `qa-tester`.

## Instagram · Instagram API with Instagram Login (publicar + Bandeja) — 2026-11-26 — Estado: ⏳ pendiente de `seguridad-legal`
- APIs usadas (oficiales, OAuth oficial de Meta): Business Login for Instagram (`www.instagram.com/oauth/authorize`,
  `api.instagram.com/oauth/access_token`, `graph.instagram.com/access_token` y `/refresh_access_token`); Content Publishing
  (`/media`, `/media_publish`, `trial_params`); Messaging (`/me/messages`), Conversations (`/me/conversations`), User Profile
  (`/{igsid}?fields=name,username`) y `/{ig-id}/subscribed_apps` (campo `messages`). Facebook Login se mantiene como alternativa.
- Permisos: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_messages`, pedidos de
  una vez al conectar en Cuentas (el dueño lo pidió así para no repetir el login). **No** se pide `instagram_business_manage_comments`.
  Minimización: el permiso de mensajes se concede al conectar aunque la Bandeja no se active; la suscripción al webhook y la
  lectura de conversaciones solo ocurren tras pulsar «Activar mensajes» (acción de servidor con sesión y rol editor).
- Datos guardados: token de usuario de Instagram (60 días) cifrado en `social_account_tokens` y, al activar la Bandeja, una
  copia cifrada en `inbox_connection_tokens` (se refrescan por separado; se borran al desconectar). `metadata.login` y
  `account_type`. Mensajes: sin cambios (30 días, solo texto y metadatos mínimos).
- Ventana de 24 h (`src/lib/inbox/window.ts`) y límite de 1.000 bytes aplicados igual; sin etiquetas salvo HUMAN_AGENT aprobado.
  Sin automatización de engagement: la IA solo propone borradores; enviar exige clic humano.
- Etiqueta IA: Instagram no tiene campo nativo en la API → se sigue añadiendo «Contenido generado con IA · AI-generated content»
  al texto, no desactivable.
- Webhook: firma `X-Hub-Signature-256` obligatoria, válida con `META_APP_SECRET` o `INSTAGRAM_APP_SECRET`. Logs sin contenido.
- Logs de errores: solo el código de la plataforma (`platformErrorDetail`, incl. `error_type`+`code` de api.instagram.com); nunca tokens.
- Riesgos / pendientes:
  1. Instagram Login no documenta revocación del token por API: al desconectar, Kreo borra el token y da de baja el webhook;
     la persona retira la app en Instagram → Configuración → Apps y sitios web. Implementar el **callback de desautorización y
     de eliminación de datos** (B4) también para el producto Instagram.
  2. Modo desarrollo: Meta solo envía webhooks a apps Live → la Bandeja depende de la sincronización cada 30 min hasta la revisión.
  3. Business Discovery (Competencia) solo con cuentas de Facebook Login.
  4. Textos de privacidad: mencionar Instagram Login y los permisos `instagram_business_*` (abogado).

## Bandeja · Instagram con Unified Login, comentarios y «marcar como leído» — 2026-11-26 — Estado: ⏳ pendiente de `seguridad-legal`
- APIs usadas (oficiales, OAuth oficial de Meta: Facebook Login for Business con `config_id` 1203482298883759):
  `GET /oauth/access_token`, `GET /debug_token`, `GET /me/assigned_instagram_accounts`, `GET /me?fields=client_business_id`,
  `POST|DELETE /<IG_ID>/subscribed_apps` (campos `messages`, `comments`), `GET /<IG_ID>/conversations`, `POST /<IG_ID>/messages`,
  `GET /<IG_ID>/media`, `GET /<MEDIA_ID>/comments` (con `replies`), `POST /<COMMENT_ID>/replies`, `POST /<COMMENT_ID>?hide=`.
  Docs: Unified Login (get-started, authentication, permissions), Comment Moderation, IG Comment, webhooks (setup, fields, examples).
- Permisos usados: `instagram_basic` y `instagram_manage_messages` (obligatorios), `instagram_manage_comments` (opcional,
  activa «Comentarios»). La configuración también pide `instagram_content_publish`, `ads_management` y `ads_read`, que la Bandeja
  **no usa**: hay que quitarlos de la configuración antes de la revisión. Sin `pages_*`.
- Datos guardados: token BISU cifrado (AES-256-GCM) en `inbox_connection_tokens`; `client_business_id` y marcas técnicas en
  `inbox_connections.metadata`. Comentarios (tablas nuevas `inbox_comment_media` e `inbox_comments`, migración
  `20261126110000_inbox_comments.sql`): de terceros solo @usuario, texto (≤ 2.200) y fecha; sin IGSID, foto ni «me gusta».
  Publicaciones: id, tipo, pie de foto propio recortado (140), enlace y URL temporal de la miniatura del CDN de Instagram.
  **Retención**: cada comentario caduca a los 30 días (`expires_at`, purga diaria `inbox-retention`); publicaciones sin
  actividad en 30 días se borran; los comentarios borrados en Instagram se borran de Kreo en la siguiente lectura completa.
  Desconectar borra todo en cascada y da de baja el webhook.
- Sin automatización de interacción: responder, ocultar/mostrar y marcar como leído son acciones humanas (botón); nada de
  respuestas automáticas, «me gusta» ni seguir cuentas. La IA solo propone un borrador (1 crédito, con reembolso si falla),
  que la persona edita y publica; en `ai_generations` no se guarda el contenido. Freno: 30 respuestas a comentarios por
  conexión y hora; solo comentarios de primer nivel, nunca ocultos ni propios (límites de la API).
- Límites de la API respetados: 1 llamada para las 25 últimas publicaciones y 1 por publicación solo si cambió su número de
  comentarios (máx. 50 por lectura); sondeo cada 30 min y como mucho 1 sincronización cada 5 min por conexión.
- «Marcar como leído»: en Kreo siempre (todo, por canal o por conversación). En la plataforma solo si el permiso ya
  concedido lo permite (Gmail `gmail.modify`, Outlook `Mail.ReadWrite`); hoy no se piden, así que no cambia nada fuera de Kreo.
  En Instagram no se usa `mark_seen` (mostraría «Visto» a la otra persona).
- RLS: lectura para miembros (viewer), solo editores cambian `unread` (trigger `guard_inbox_comment_update`), escrituras de
  contenido solo con service_role tras comprobar el rol con la sesión; política restrictiva `mfa_required`.
- Riesgos / pendientes:
  1. Webhooks: "Your app must be published or Live to receive notifications for app users"; `comments` exige Advanced Access y
     cuentas públicas. Con Unified Login sin página vinculada, los webhooks de `messages` pueden no llegar (limitación temporal
     documentada) → hasta entonces la Bandeja depende del sondeo cada 30 min.
  2. App Review: Advanced Access de `instagram_manage_comments` (nuevo) además de `instagram_basic` y `instagram_manage_messages`.
  3. Privacidad (abogado): añadir comentarios de terceros (qué, para qué, 30 días) y Unified Login/BISU a la política y al RoPA.
  4. Callback de desautorización/eliminación de datos de Meta (B4), también para BISU.

## Pendientes para Oier (de esta revisión)
1. Aplicar `supabase/migrations/20261124150000_security_fixes.sql` en producción.
2. Firmar/aceptar el DPA de fal.ai y pedir su lista de subencargados (ElevenLabs para `auto-subtitle`).
3. Abogado: revisar los cambios en la política de privacidad (Clipper, ElevenLabs vía fal, plazos de avisos).
4. Prueba real de la subida directa a YouTube (CORS) y de un subtítulo en borrador.
