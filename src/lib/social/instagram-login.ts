/**
 * Instagram API with Instagram Login (Business Login for Instagram) — lógica PURA (sin red ni secretos), testeable.
 * Oficial: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
 *
 * - Autorización: https://www.instagram.com/oauth/authorize (client_id, redirect_uri, response_type=code, scope, state).
 * - code → token corto: POST https://api.instagram.com/oauth/access_token (grant_type=authorization_code).
 * - Token largo (60 días): GET https://graph.instagram.com/access_token (grant_type=ig_exchange_token).
 * - Refresco: GET https://graph.instagram.com/refresh_access_token (grant_type=ig_refresh_token); el token debe tener
 *   al menos 24 h y no haber caducado.
 * Sin página de Facebook: la persona entra con su usuario de Instagram (cuenta profesional).
 */

export const IG_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const IG_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const IG_GRAPH_HOST = "https://graph.instagram.com";

/** Permisos mínimos (nombres vigentes; los antiguos `business_*` caducaron el 27-01-2025). */
export const IG_SCOPE_BASIC = "instagram_business_basic";
export const IG_SCOPE_PUBLISH = "instagram_business_content_publish";
export const IG_SCOPE_MESSAGES = "instagram_business_manage_messages";
/**
 * Se piden de una vez al conectar en Cuentas: perfil (basic), publicar (content_publish) y mensajes de la Bandeja
 * (manage_messages). NO se pide `instagram_business_manage_comments`: Kreo no lee ni responde comentarios.
 */
export const IG_LOGIN_SCOPES = [IG_SCOPE_BASIC, IG_SCOPE_PUBLISH, IG_SCOPE_MESSAGES];
/** Lo imprescindible para publicar (si falta alguno, la cuenta queda como «faltan permisos»). */
export const IG_PUBLISH_SCOPES = [IG_SCOPE_BASIC, IG_SCOPE_PUBLISH];

/** Marca en `social_accounts.metadata` / `inbox_connections.metadata` de las cuentas conectadas con Instagram Login. */
export const IG_LOGIN_MARK = "instagram";

/** ¿Está activada la conexión con Instagram Login? (si no, se usa Facebook Login for Business como hasta ahora). */
export function instagramLoginEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.INSTAGRAM_APP_ID && env.INSTAGRAM_APP_SECRET);
}

/** ¿Esta cuenta/conexión se conectó con Instagram Login? Las de Facebook Login llevan `page_id` y no esta marca. */
export function isInstagramLogin(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === "object" && (metadata as { login?: unknown }).login === IG_LOGIN_MARK);
}

export function igGraph(version: string = process.env.META_GRAPH_VERSION ?? "v27.0") {
  return `${IG_GRAPH_HOST}/${version}`;
}

/** URL de autorización de Instagram Login. `scope` separado por comas, como en la documentación oficial. */
export function buildIgAuthorizeUrl(o: { clientId: string; redirectUri: string; state: string; scopes: string[] }): string {
  const p = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: o.scopes.join(","),
    state: o.state,
  });
  return `${IG_AUTHORIZE_URL}?${p}`;
}

/** Instagram añade `#_` al final del code en la redirección: no forma parte del código. */
export function cleanIgCode(code: string): string {
  return code.replace(/#_$/, "").trim();
}

export type IgShortToken = { accessToken: string; userId: string | null; permissions: string[] };

/**
 * Respuesta del intercambio del code. La doc la muestra como `{ data: [{ access_token, user_id, permissions }] }`
 * con `permissions` en una cadena separada por comas; aceptamos también la forma plana y `permissions` como array.
 * `user_id` puede venir como número grande: se usa solo como pista (el id fiable sale de GET /me?fields=user_id).
 */
export function parseIgShortToken(body: unknown): IgShortToken | null {
  const root = body as { data?: unknown[] } | null;
  const item = (Array.isArray(root?.data) ? root!.data[0] : root) as { access_token?: unknown; user_id?: unknown; permissions?: unknown } | null;
  if (!item || typeof item.access_token !== "string" || !item.access_token) return null;
  const raw = item.permissions;
  const permissions = (Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(",") : []).map((s) => s.trim()).filter(Boolean);
  const userId = typeof item.user_id === "string" || typeof item.user_id === "number" ? String(item.user_id) : null;
  return { accessToken: item.access_token, userId, permissions };
}

const DAY = 86_400_000;
/** Vida de un token largo de Instagram (60 días, según la documentación). */
export const IG_LONG_LIVED_MS = 60 * DAY;
/** Refrescamos cuando quedan menos de 10 días (la tarea diaria y el ciclo de métricas lo intentan varias veces). */
export const IG_REFRESH_LEAD_MS = 10 * DAY;

/**
 * ¿Toca refrescar el token largo? Solo si caduca en < 10 días, no ha caducado ya y tiene al menos 24 h
 * (requisito de `refresh_access_token`; la antigüedad se deduce de la caducidad: emitido = caduca − 60 días).
 */
export function igRefreshDue(expiresAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const exp = expiresAt.getTime();
  const t = now.getTime();
  if (!Number.isFinite(exp) || exp <= t) return false;
  if (exp - t > IG_REFRESH_LEAD_MS) return false;
  const issuedAt = exp - IG_LONG_LIVED_MS;
  return t - issuedAt >= DAY;
}
