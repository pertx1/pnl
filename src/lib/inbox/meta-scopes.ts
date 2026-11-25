/**
 * Permisos de la Bandeja de Instagram con Facebook Login for Business — lógica PURA (sin red ni secretos), testeable.
 *
 * Hay dos variantes oficiales sobre el mismo diálogo de Facebook Login for Business (`config_id`):
 *
 * 1) **Instagram API with Unified Login** (la configuración por defecto «Instagram API (Unified Login)»: cuenta de
 *    Instagram + permisos `instagram_*`). El code se cambia por un *Business Integration System User Access Token*
 *    (BISU), `/me/assigned_instagram_accounts` devuelve las cuentas compartidas y TODO va contra
 *    `graph.facebook.com/<IG_ID>/…`: conversaciones, mensajes, comentarios y `subscribed_apps`. NO hace falta página
 *    de Facebook ni `pages_*`.
 *    https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started
 *    ("The `instagram_basic` and `instagram_manage_messages` permissions, which are required, plus
 *    `instagram_manage_comments`, `instagram_content_publish`, `ads_management`, and `ads_read`")
 *
 * 2) **Instagram API with Facebook Login** (clásica, con página): token de usuario → `/me/accounts` → token de página.
 *    Exige `pages_show_list` (listar páginas) y `pages_manage_metadata` (suscribir la página al webhook).
 *    https://developers.facebook.com/documentation/business-messaging/instagram-messaging/get-started
 */

/** Marca en `inbox_connections.metadata.login` de las conexiones con Unified Login (token BISU). */
export const IG_UNIFIED_MARK = "unified";

export const FB_SCOPE_BASIC = "instagram_basic";
export const FB_SCOPE_MESSAGES = "instagram_manage_messages";
export const FB_SCOPE_COMMENTS = "instagram_manage_comments";

/** Unified Login: mínimo para leer conversaciones, responder y suscribir el webhook `messages`. */
export const UNIFIED_REQUIRED_SCOPES = [FB_SCOPE_BASIC, FB_SCOPE_MESSAGES];
/** Facebook Login clásico (con página). */
export const LEGACY_REQUIRED_SCOPES = [FB_SCOPE_BASIC, FB_SCOPE_MESSAGES, "pages_manage_metadata", "pages_show_list"];

export function isUnifiedLogin(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === "object" && (metadata as { login?: unknown }).login === IG_UNIFIED_MARK);
}

/** ¿La conexión tiene activados los comentarios? (se concedió `instagram_manage_comments` al conectar). */
export function commentsEnabled(metadata: unknown): boolean {
  return isUnifiedLogin(metadata) && (metadata as { comments?: unknown }).comments === "1";
}

/** Permisos que faltan (solo nombres: se pueden registrar en logs). */
export function missingScopes(required: readonly string[], granted: readonly string[]): string[] {
  const g = new Set(granted.map((s) => s.trim()));
  return required.filter((s) => !g.has(s));
}

/** Campos del webhook a suscribir según los permisos concedidos (deben estar también marcados en el panel de Meta). */
export function webhookFields(granted: readonly string[]): string[] {
  const g = new Set(granted);
  const out: string[] = [];
  if (g.has(FB_SCOPE_MESSAGES)) out.push("messages");
  if (g.has(FB_SCOPE_COMMENTS)) out.push("comments");
  return out;
}

export type DebugTokenInfo = { valid: boolean; scopes: string[]; expiresAt: Date | null };

/**
 * Respuesta de `GET /debug_token`: `{ data: { is_valid, scopes, expires_at, … } }`. `expires_at` = 0 → no caduca.
 * https://developers.facebook.com/docs/graph-api/reference/debug_token/
 */
export function parseDebugToken(body: unknown): DebugTokenInfo | null {
  const d = (body as { data?: unknown } | null)?.data as { is_valid?: unknown; scopes?: unknown; expires_at?: unknown } | undefined;
  if (!d || typeof d !== "object") return null;
  const scopes = Array.isArray(d.scopes) ? d.scopes.filter((s): s is string => typeof s === "string") : [];
  const exp = typeof d.expires_at === "number" && d.expires_at > 0 ? new Date(d.expires_at * 1000) : null;
  return { valid: d.is_valid === true, scopes, expiresAt: exp };
}

export type AssignedIgAccount = { id: string; username: string | null };

/** `GET /me/assigned_instagram_accounts?fields=id,username` (Unified Login). Ignora entradas sin id numérico. */
export function parseAssignedAccounts(body: unknown): AssignedIgAccount[] | null {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return null;
  return data
    .map((a) => a as { id?: unknown; username?: unknown })
    .filter((a) => (typeof a.id === "string" || typeof a.id === "number") && /^\d{1,30}$/.test(String(a.id)))
    .map((a) => ({ id: String(a.id), username: typeof a.username === "string" ? a.username : null }));
}
