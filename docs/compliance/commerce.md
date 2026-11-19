# Cumplimiento · Módulo Commerce (Shopify 5.13, informes PDF 5.14, servidor MCP 5.18)

Pendiente de revisión por el subagente `seguridad-legal` antes de cerrar el módulo y de `qa-tester` antes del merge.
Migración: `supabase/migrations/20261120140000_commerce.sql`.

## Shopify — 2026-11-19 — Estado: ⚠️ pendiente de revisión (con condiciones)
- APIs usadas (oficiales): OAuth de Shopify, *authorization code grant* para apps públicas/no embebidas, con token
  **offline caducable** (`expiring=1`, refresh token de 90 días, obligatorio para apps públicas nuevas) — verificado en
  shopify.dev el 2026-11-19. Admin GraphQL API `2026-10` (`shop`, `orders`, `discountCodeBasicCreate`,
  `webhookSubscriptionCreate`). Webhooks HTTPS con HMAC. Revocación con `DELETE /admin/api_permissions/current.json`.
- Permisos / scopes (mínimos):
  - `read_orders`: ventas y atribución (solo últimos 60 días; NO pedimos `read_all_orders`).
  - `read_products`: productos top (el título viene en los line items).
  - `read_discounts` + `write_discounts`: crear códigos por publicación/creador y consultarlos.
- Seguridad del flujo: estado anti-CSRF firmado (HMAC) en cookie httpOnly 10 min ligado a proyecto + tienda; verificación
  HMAC de la query de vuelta (comparación en tiempo constante); dominio validado con `^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$`
  (con ancla `$`); rol editor+ comprobado con la sesión del usuario; comprobación de scopes concedidos.
- Datos guardados:
  - `shopify_stores`: dominio, nombre y moneda de la tienda, scopes, estado. Hasta desvincular / `shop/redact`.
  - `shopify_store_tokens`: access + refresh token **cifrados AES-256-GCM** (`TOKEN_ENCRYPTION_KEY`), RLS sin políticas
    (solo service_role). Se borran al desinstalar (`app/uninstalled`) o desvincular.
  - `shopify_orders` (agregado, **sin datos personales de clientes**): id y número de pedido, fecha, total, moneda, códigos de
    descuento, ruta de aterrizaje (sin query), `utm_*`, line items (id de producto, título, cantidad), cancelado/prueba.
    No se guarda nombre, email, teléfono, dirección, IP ni id de cliente. Los webhooks de pedidos se suscriben con
    `includeFields` (Shopify ni siquiera envía los campos de cliente) y además se filtran con lista blanca en el servidor.
  - `commerce_attributions`: enlaces UTM y códigos creados (etiqueta de creador = texto libre que escribe el usuario).
- Webhooks obligatorios RGPD (endpoint único `/api/shopify/webhooks`, 401 si el HMAC no cuadra):
  - `customers/data_request`: no almacenamos datos personales del cliente → se registra la solicitud en `activity_log`
    (sin datos del cliente) para poder contestar al comerciante.
  - `customers/redact`: se borran los pedidos de `orders_to_redact` (aunque no tengan datos personales).
  - `shop/redact`: se borra la tienda (cascada: tokens y pedidos) y los códigos de descuento del proyecto.
  - `app/uninstalled`: borra tokens al momento y marca la tienda como desinstalada.
- Riesgos:
  1. **Protected customer data**: el objeto `Order` es "protected customer data" aunque no leamos campos personales →
     hay que solicitar en el Partner Dashboard el **nivel 1** (sin campos de nivel 2: nombre, email, teléfono, dirección)
     y rellenar el cuestionario (minimización, cifrado, retención, acceso por roles). Sin aprobación, en producción la
     API no devuelve pedidos de tiendas que no son de desarrollo.
  2. Kreo actúa como **encargado** del comerciante (Shopify es el responsable de cara al cliente final) → DPA con clientes
     (ya pendiente en la revisión general) y política de privacidad (ya menciona Shopify y webhooks RGPD).
  3. `customerJourneySummary`/UTM depende de que la tienda tenga analítica; si no, la atribución por UTM queda vacía
     (la de códigos funciona siempre).
  4. Los códigos creados en Shopify no se borran al quitarlos de Kreo (se gestionan en la tienda; la UI lo dice).
- Mitigaciones: minimización por diseño (lista blanca + `includeFields`); cifrado; RLS (viewer lee, escrituras solo servidor);
  sincronización periódica limitada (Inngest, 1 por tienda, throttle) con backoff ante 429/`THROTTLED`; logs sin payloads.
- Pendiente:
  1. Crear la app en el Partner/Dev Dashboard y configurar URLs (ver informe), los 3 webhooks de cumplimiento
     (`compliance_topics`) y solicitar acceso a protected customer data nivel 1.
  2. Instalación iniciada desde la tienda (App Store): hoy se verifica el HMAC y se manda a `/app` para elegir proyecto;
     añadir un selector de proyecto que inicie el OAuth.
  3. Plazo de conservación de `shopify_orders` (propuesto: 13 meses o hasta desvincular) → documentar en `docs/ropa.md`.

## Informes PDF de marca blanca — 2026-11-19 — Estado: ⚠️ pendiente de revisión (con condiciones)
- APIs usadas: ninguna externa para el PDF (pdf-lib, MIT, JS puro, en servidor). Email con `sendEmail` (Resend hoy).
- Datos tratados: KPIs de `account_metrics_daily`, publicaciones publicadas (+ `post_metrics`), ventas agregadas; logo y
  colores del brand kit. El PDF se genera al vuelo y **no se guarda** (`Cache-Control: no-store`).
- Envíos programados (`report_schedules`): emails de destinatarios del cliente (terceros), nombre del remitente,
  frecuencia. Lista de bajas `report_unsubscribes` con **solo el hash SHA-256** del email (no se puede volver a añadir;
  lo impide también un trigger en BD).
- Verificado: casilla obligatoria de que los destinatarios han aceptado recibirlos; cada email dice **quién lo envía**
  ("{remitente} a través de Kreo"), por qué lo recibe y enlace de **baja en un clic** (`List-Unsubscribe` +
  `List-Unsubscribe-Post`, RFC 8058; la página GET pide confirmación con botón para que los escáneres de enlaces no den de
  baja). El proveedor actual no admite adjuntos en nuestra capa → **enlace firmado HMAC** que caduca a los 14 días y deja
  de funcionar si se borra/pausa la programación; la descarga sin sesión regenera el PDF con el cliente de servicio solo
  para esa programación y periodo. Máx. 10 destinatarios y 5 programaciones por proyecto; "Enviar ahora" máx. 1 cada 10 min.
- Riesgos: emails a terceros (LSSI art. 21: son comunicaciones informativas solicitadas, no comerciales; aun así llevan
  baja); el enlace de descarga reenviado da acceso a quien lo tenga durante 14 días; YouTube (los datos se muestran solo por
  canal, sin sumarlos a totales, como en analíticas).
- Pendiente: proveedor de email UE con DPA; decidir si el enlace debe exigir además un código; añadir los informes a `docs/ropa.md`.

## Servidor MCP — 2026-11-19 — Estado: ⚠️ pendiente de revisión (con condiciones)
- SDK oficial `@modelcontextprotocol/server` 2.4.0 (Apache-2.0), transporte Streamable HTTP sin estado (`createMcpHandler`,
  sirve también clientes 2025 en modo stateless). Endpoint `/api/mcp`.
- Autenticación: API key personal `kreo_sk_…` (256 bits). En BD solo hash SHA-256 + prefijo; se muestra entera una sola vez.
  Alta/revocación vía funciones `SECURITY DEFINER` que exigen sesión y 2FA (aal2 si el usuario tiene 2FA). Máx. 10 activas.
- Permisos: cada herramienta comprueba el rol del usuario en el workspace en cada llamada (`member_role`): viewer para leer,
  editor para crear borradores o usar IA. Un cambio de rol o la expulsión del workspace se aplica al instante.
- Sección 0: `create_draft_post` crea BORRADOR o lo envía a aprobación (con las reglas por red; sin medios no pasa) y
  **nunca aprueba ni publica**; `draft_reply` devuelve texto, **nunca envía**. Ninguna herramienta de engagement.
- Créditos: `draft_reply` cobra 1 crédito con `mcp_start_ai_generation` (atómico, idempotente) y devuelve el crédito si falla.
- Rate limiting: 60/min y 2.000/día por clave (ventanas fijas en Postgres, `mcp_rate_limit_hit`). Registro de cada acción
  de escritura/IA en `activity_log` con `via: mcp`. Anti DNS-rebinding con validación de `Origin`.
- Riesgos:
  1. Una API key **no pasa por 2FA** en cada uso (es su naturaleza): si se filtra, da acceso con los permisos del usuario
     hasta revocarla. Mitigación: hash en BD, revocación inmediata, "usada hace…" visible, límite de peticiones.
  2. Los datos que devuelve el MCP salen hacia el cliente de IA que elija el usuario (Claude u otro): el usuario lo decide
     y lo inicia; hay que mencionarlo en la política de privacidad. **YouTube**: los datos de canal solo se devuelven por canal;
     revisar con Google si exponerlos a un asistente de terceros es aceptable (YouTube API Services, III.E).
  3. `analyze_competitor`/`search_products` leen tablas del módulo de investigación si existen (si no, "no disponible todavía").
- Pendiente: OAuth 2.1 (conector de Claude.ai, que no admite cabeceras personalizadas): siguiente paso; caducidad opcional de claves.
