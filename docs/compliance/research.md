# Cumplimiento · Módulo de investigación (competencia, productos ganadores, inspiración)

Plantilla de `docs/compliance.md`. Pendiente de revisión por el subagente `seguridad-legal` antes de cerrar el módulo.

## Investigación (5.8 · 5.9 · 5.10) — 2026-11-20 — Estado: ⚠️ con condiciones (pendiente de `seguridad-legal`)

- **APIs usadas** (todas oficiales; nada de scraping, APIs no oficiales ni automatización de engagement):
  - **YouTube Data API v3** con clave de API (`GOOGLE_API_KEY`), solo datos públicos: `channels.list` (`forHandle`/`id`),
    `playlistItems.list` (lista de subidas) y `videos.list` (`snippet,statistics`). 3 unidades de cuota por canal; nunca `search.list` (100).
  - **Instagram Business Discovery** (Instagram API con Facebook Login): `GET /{ig-user-id}?fields=business_discovery.username(...)`
    con el token de una cuenta business/creator **conectada en el proyecto** (token en cabecera + `appsecret_proof`).
    Solo `followers_count`, `media_count`, nombre, avatar y, por publicación, `caption`, `like_count`, `comments_count`, `timestamp`,
    `permalink`, `media_type`. **No** pedimos `media_url` (no copiamos contenido).
  - **Meta Ad Library API** (`/ads_archive`, `ad_type=ALL`, `ad_reached_countries` de un país UE): campos verificados en la
    documentación oficial el 2026-11-19 (`id`, `ad_creation_time`, `ad_creative_bodies`, `ad_creative_link_titles`,
    `ad_creative_link_captions`, `ad_delivery_start_time`, `ad_delivery_stop_time`, `languages`, `page_id`, `page_name`,
    `publisher_platforms`, `eu_total_reach` y `target_locations` — los dos últimos solo UE/UK). Token `META_AD_LIBRARY_TOKEN`.
    **No usamos `ad_snapshot_url`** (lleva el token en la URL): enlazamos a `facebook.com/ads/library/?id=…`.
  - **oEmbed oficial**: YouTube (`youtube.com/oembed`) y TikTok (`tiktok.com/oembed`) públicos; Instagram (`instagram_oembed`) solo si
    hay token de app (`META_APP_ID|META_CLIENT_TOKEN`, función "oEmbed Read"); sin token se guarda solo la URL.
  - **Anthropic (Claude Opus 5.5)** para los agentes Analista, Cazador y generador de hooks/borradores (texto).
  - **TikTok**: no hay API oficial para perfiles ajenos (la Research API es académica/no comercial) → proveedor `none`
    (`PublicDataProvider`), UI "Próximamente · datos estimados de un proveedor externo" con coste en créditos.
- **Permisos / scopes**: ninguno nuevo. Instagram reutiliza `instagram_basic` + `pages_read_engagement` ya pedidos al conectar
  (Business Discovery debe declararse en App Review como caso de uso). Ad Library: verificación de identidad del titular del token.
- **Datos guardados** (Supabase UE, RLS por workspace, 2FA restrictivo; viewer lee, editor crea/edita/borra):
  - `research_competitors`: id externo, handle, nombre, avatar (URL), URL del perfil, seguidores, views totales, nº publicaciones,
    fecha de actualización, código de error (nunca el mensaje de la API). Cuenta IG usada (`via_social_account_id`).
  - `research_competitor_posts`: hasta 50 por perfil (título/caption ≤ 1.000 caracteres, URL, miniatura de YouTube, fecha, views,
    likes, comentarios). Las que la API deja de devolver se borran en cada actualización.
  - `research_alerts`: outliers nuevos (post + múltiplo).
  - `research_products` y `research_product_lists`: anuncio guardado por el usuario (id de la Ad Library, nombre de la página,
    textos, plataformas, ubicaciones, fecha de inicio, puntuación), notas, enlace al proveedor, calculadora de margen.
  - `research_swipes`: URL + título/autor/miniatura de oEmbed + notas y etiquetas del usuario. **No se descarga ni se aloja contenido.**
  - `research_hooks`: texto, nicho, formato, origen (usuario/IA, con `generation_id`).
  - `research_analyses`: resultado JSON de los agentes + versión del prompt + `generation_id`.
  - **Plazos**: YouTube ("Non-Authorized Data") se refresca cada 6 h y la tarea diaria `research-retention` vuelve a pedir lo que
    tenga > 20 días y **borra** lo que siga con > 29 días (publicaciones, alertas, análisis derivados y estadísticas del canal);
    también refresca o borra los metadatos oEmbed de YouTube del swipe file. Resto: hasta que el usuario lo borre o se borre el proyecto.
  - Logs: solo códigos de error y nombre del agente; sin URLs (llevan claves), tokens, handles ni textos.
- **Riesgos**:
  1. **YouTube III.E.4.h (métricas derivadas)**: outliers, múltiplo "6,2×" y posts/semana son métricas calculadas sobre datos de la API,
     prohibidas salvo a desarrolladores **auditados con caso de uso de analítica (III.L)**. Mitigación: desactivadas para YouTube por
     defecto (`YOUTUBE_DERIVED_METRICS_APPROVED=false`); se muestran los datos tal cual + ordenación. Si se activan, cada cifra lleva
     "Calculado por Kreo, no es un dato de YouTube". **Decisión de Oier**: solicitar la auditoría de YouTube API Services.
  2. YouTube III.E.2 (agregación) y III.E.2.b (insights sobre el negocio de YouTube): no combinamos datos de YouTube con otras redes
     ni calculamos totales entre canales. El análisis de IA usa títulos y cifras de un solo canal: el abogado/`seguridad-legal`
     debe confirmar que no es "derived data" prohibido; si lo fuera, limitar el Analista a Instagram o a datos introducidos por el usuario.
  3. YouTube III.A.1 / III.A.2.c / III.F.2.a: enlace a Términos de YouTube y Política de privacidad de Google + marca "YouTube" donde se
     muestran datos. Pendiente: usar el logotipo oficial de "YouTube" según las Branding Guidelines (ahora es una etiqueta de texto).
  4. **Meta Platform Terms / Business Discovery**: uso de datos de cuentas profesionales públicas de terceros para análisis competitivo.
     Hay que declararlo en App Review; no se venden ni se ceden datos; borrado al dejar de seguir. Si la cuenta IG conectada se
     desconecta, los perfiles dejan de actualizarse (código `needs_connected_account`).
  5. **Ad Library API Terms**: el token es personal de Oier (verificación de identidad) y lo comparten todos los workspaces →
     límites de peticiones compartidos y responsabilidad del titular. Uso permitido para investigación de anuncios; no se descargan
     creatividades. Revisar si los términos permiten uso comercial en un SaaS para terceros (consulta legal / soporte de Meta).
  6. **RGPD**: los perfiles seguidos pueden ser personas físicas (creadores). Base jurídica: interés legítimo (LIA pendiente, ya
     señalado en `docs/compliance.md`), deber de información del art. 14 (aviso en la política de privacidad), minimización
     (solo campos públicos necesarios, plazos de borrado) y derecho de oposición (borrado a petición).
  7. **Avatares y miniaturas** se cargan desde los CDN de las plataformas (IP del navegador a terceros, `referrerPolicy=no-referrer`):
     mencionarlo en la política de privacidad/cookies (ya anotado para avatares propios).
  8. **IA**: los textos de terceros se envían a Anthropic como datos (marcados `<data>`, instrucciones anti-inyección). Salidas con
     etiqueta "Generado con IA"; nada se publica: "Crear algo parecido" solo abre el editor con un borrador y la persona lo aprueba.
  9. **Propiedad intelectual**: el swipe file guarda enlaces y miniaturas que sirven las propias plataformas para incrustar; el
     borrador "parecido" pide ideas originales (no copiar frases). Aviso visible en la UI.
- **Mitigaciones técnicas verificadas**: RLS en las 8 tablas (`has_workspace_role` viewer/editor) + política `mfa_required`;
  triggers de coherencia workspace/proyecto (`enforce_project_workspace`, `research_child_workspace_guard`, este último sin EXECUTE
  para `authenticated`); `get_advisors` (security) sin avisos nuevos; zod en todas las acciones; URLs solo `https://` sin
  credenciales; fetch con timeout 15 s, máx. 3 intentos con backoff y `Retry-After`; cuota YouTube mínima y actualización manual
  limitada a una cada 10 min; coste en créditos visible antes de cada acción de IA y cobro atómico con devolución si falla.
- **Pendiente**:
  1. `seguridad-legal`: revisar y aprobar esta entrada; añadirla a `docs/compliance.md`.
  2. Oier: verificación de identidad de Meta + token de Ad Library; crear `GOOGLE_API_KEY` restringida a YouTube Data API v3;
     solicitar auditoría de YouTube (III.L) si se quieren outliers de YouTube; `META_CLIENT_TOKEN` para oEmbed de Instagram.
  3. Política de privacidad: tratamiento de datos públicos de terceros (art. 14), fuentes (YouTube, Meta) y plazos.
  4. TikTok: elegir proveedor externo con licencia y método de obtención legal antes de activar el proveedor (hoy `none`).
