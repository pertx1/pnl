import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Lógica pura del servidor de autorización OAuth 2.1 del MCP (sin acceso a BD; testeada en tests/unit/mcp-oauth*.test.ts).
 * Especificación MCP 2026-07-28 · Authorization; guía de conectores de Claude (claude.com/docs/connectors/building/authentication).
 */

export const OAUTH_SCOPE = "kreo";
export const SUPPORTED_SCOPES = [OAUTH_SCOPE] as const;
export const ACCESS_TTL_SECONDS = 60 * 60; // 1 h
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 días
export const CODE_TTL_SECONDS = 5 * 60; // lo fija la BD (mcp_oauth_create_code)

/** Prefijos de los secretos: permiten distinguirlos de las API keys (kreo_sk_) y detectarlos si se filtran. */
export const TOKEN_PREFIX = { access: "kreo_at_", refresh: "kreo_rt_", code: "kreo_ac_" } as const;
export type TokenKind = keyof typeof TOKEN_PREFIX;
const TOKEN_RE: Record<TokenKind, RegExp> = {
  access: /^kreo_at_[A-Za-z0-9_-]{43}$/,
  refresh: /^kreo_rt_[A-Za-z0-9_-]{43}$/,
  code: /^kreo_ac_[A-Za-z0-9_-]{43}$/,
};

/** Token aleatorio de 256 bits. En BD solo se guarda `hashToken(token)`. */
export function generateToken(kind: TokenKind) {
  return `${TOKEN_PREFIX[kind]}${randomBytes(32).toString("base64url")}`;
}

export function isWellFormedToken(kind: TokenKind, token: string) {
  return TOKEN_RE[kind].test(token);
}

/** SHA-256 en hex (mismo formato que las API keys). Los tokens tienen 256 bits de entropía: no hace falta sal ni KDF lento. */
export function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// ------------------------------------------------------------------------------------------------ PKCE (RFC 7636)
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

export function isValidCodeVerifier(v: unknown): v is string {
  return typeof v === "string" && VERIFIER_RE.test(v);
}

/** El challenge S256 es BASE64URL(SHA256(verifier)) sin relleno: siempre 43 caracteres. */
export function isValidCodeChallenge(c: unknown): c is string {
  return typeof c === "string" && CHALLENGE_RE.test(c);
}

export function s256(verifier: string) {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

/** Comprueba code_verifier frente al code_challenge guardado (comparación en tiempo constante). */
export function verifyPkce(verifier: string, challenge: string) {
  if (!isValidCodeVerifier(verifier) || !isValidCodeChallenge(challenge)) return false;
  const a = Buffer.from(s256(verifier));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ------------------------------------------------------------------------------------------------ Redirect URIs
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLoopbackHost(hostname: string) {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/**
 * Validación de una redirect URI al registrarla: https (sin fragmento ni credenciales), o http SOLO en loopback
 * (localhost / 127.0.0.1 / [::1]) para clientes nativos como Claude Code (RFC 8252).
 */
export function validateRedirectUri(raw: unknown): { ok: true; uri: string; loopback: boolean } | { ok: false } {
  if (typeof raw !== "string" || raw.length > 2000 || raw.length < 10) return { ok: false };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false };
  }
  if (u.hash || raw.includes("#") || u.username || u.password) return { ok: false };
  const loopback = isLoopbackHost(u.hostname);
  if (u.protocol === "https:") return { ok: true, uri: raw, loopback };
  if (u.protocol === "http:" && loopback) return { ok: true, uri: raw, loopback: true };
  return { ok: false };
}

/**
 * ¿Coincide la redirect_uri pedida con alguna registrada? Coincidencia EXACTA de la cadena, salvo en loopback,
 * donde se ignora el puerto (RFC 8252 §7.3; Claude Code usa un puerto efímero y declara localhost y 127.0.0.1).
 */
export function redirectUriMatches(requested: string, registered: readonly string[]) {
  if (registered.includes(requested)) return true;
  const r = validateRedirectUri(requested);
  if (!r.ok || !r.loopback) return false;
  const req = new URL(requested);
  return registered.some((reg) => {
    const v = validateRedirectUri(reg);
    if (!v.ok || !v.loopback) return false;
    const u = new URL(reg);
    return u.protocol === req.protocol && u.hostname === req.hostname && u.pathname === req.pathname && u.search === req.search;
  });
}

/** Host que se muestra en la pantalla de consentimiento (la especificación exige mostrarlo claramente). */
export function redirectHost(uri: string) {
  try {
    return new URL(uri).host;
  } catch {
    return "";
  }
}

// ------------------------------------------------------------------------------------------------ Recurso (RFC 8707)
/** Forma canónica de un identificador de recurso: esquema y host en minúsculas, sin fragmento ni barra final. */
export function canonicalResource(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.hash || (u.protocol !== "https:" && u.protocol !== "http:")) return null;
  const path = u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
}

/** El parámetro `resource` (si viene) debe identificar este servidor MCP. */
export function resourceMatches(requested: string | null | undefined, expected: string) {
  if (requested === null || requested === undefined || requested === "") return true; // clientes antiguos: se liga igualmente al recurso propio
  const a = canonicalResource(requested);
  return a !== null && a === canonicalResource(expected);
}

// ------------------------------------------------------------------------------------------------ Scopes
/** Kreo tiene un único scope ("kreo"). Se ignoran los desconocidos (p. ej. offline_access): RFC 6749 §3.3 permite conceder menos. */
export function grantedScope(requested: string | null | undefined) {
  void requested;
  return OAUTH_SCOPE;
}

// ------------------------------------------------------------------------------------------------ Clientes
const DCR_CLIENT_RE = /^kreo_cl_[A-Za-z0-9_-]{22}$/;
export function generateClientId() {
  return `kreo_cl_${randomBytes(16).toString("base64url")}`;
}
export function isDcrClientId(id: string) {
  return DCR_CLIENT_RE.test(id);
}

/** client_id con forma de Client ID Metadata Document: URL https con ruta, de un host de la lista permitida. */
export function isCimdClientId(id: string, allowedHosts: readonly string[]) {
  if (id.length > 300) return false;
  let u: URL;
  try {
    u = new URL(id);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.hash || u.port) return false;
  if (u.pathname === "/" || u.pathname === "") return false;
  return allowedHosts.includes(u.hostname.toLowerCase());
}

export type ClientMetadata = { clientName: string; clientUri: string | null; redirectUris: string[] };

const cleanText = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "");

/** Valida un documento CIMD: client_id idéntico a la URL, redirect_uris válidas, cliente público. */
export function parseCimdDocument(doc: unknown, url: string): ClientMetadata | null {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const d = doc as Record<string, unknown>;
  if (d.client_id !== url) return null;
  if (!Array.isArray(d.redirect_uris) || d.redirect_uris.length === 0 || d.redirect_uris.length > 10) return null;
  const uris: string[] = [];
  for (const r of d.redirect_uris) {
    const v = validateRedirectUri(r);
    if (!v.ok) return null;
    uris.push(v.uri);
  }
  const method = d.token_endpoint_auth_method ?? "none";
  if (method !== "none") return null; // solo clientes públicos (PKCE)
  const name = cleanText(d.client_name, 100);
  if (!name) return null;
  const clientUri = typeof d.client_uri === "string" && /^https:\/\//.test(d.client_uri) ? d.client_uri.slice(0, 300) : null;
  return { clientName: name, clientUri, redirectUris: uris };
}

/** Valida una petición de registro dinámico (RFC 7591). Kreo solo registra clientes públicos con PKCE. */
export function parseRegistrationRequest(body: unknown): { ok: true; meta: ClientMetadata } | { ok: false; error: "invalid_redirect_uri" | "invalid_client_metadata"; description: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_client_metadata", description: "Body must be a JSON object." };
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.redirect_uris) || b.redirect_uris.length === 0 || b.redirect_uris.length > 10) {
    return { ok: false, error: "invalid_redirect_uri", description: "redirect_uris must contain 1 to 10 URIs." };
  }
  const uris: string[] = [];
  for (const r of b.redirect_uris) {
    const v = validateRedirectUri(r);
    if (!v.ok) return { ok: false, error: "invalid_redirect_uri", description: "Redirect URIs must use https, or http on localhost/127.0.0.1." };
    uris.push(v.uri);
  }
  const grants = b.grant_types;
  if (grants !== undefined && (!Array.isArray(grants) || grants.some((g) => g !== "authorization_code" && g !== "refresh_token"))) {
    return { ok: false, error: "invalid_client_metadata", description: "Only authorization_code and refresh_token grants are supported." };
  }
  const responses = b.response_types;
  if (responses !== undefined && (!Array.isArray(responses) || responses.some((r) => r !== "code"))) {
    return { ok: false, error: "invalid_client_metadata", description: "Only the code response type is supported." };
  }
  const clientUri = typeof b.client_uri === "string" && /^https:\/\//.test(b.client_uri) ? b.client_uri.slice(0, 300) : null;
  return { ok: true, meta: { clientName: cleanText(b.client_name, 100) || "MCP client", clientUri, redirectUris: [...new Set(uris)] } };
}

// ------------------------------------------------------------------------------------------------ Petición de autorización
export type AuthorizeParams = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scope: string;
  resource: string;
};

export type AuthorizeCheck =
  | { ok: true; params: AuthorizeParams }
  /** Error que se puede devolver al cliente por su redirect_uri (ya validada). */
  | { ok: false; redirectable: true; error: "invalid_request" | "unsupported_response_type" | "invalid_target"; description: string }
  /** client_id o redirect_uri no válidos: NUNCA se redirige (evita open redirect); se muestra una página de error. */
  | { ok: false; redirectable: false; reason: "invalid_client" | "invalid_redirect_uri" | "invalid_request" };

/**
 * Valida una petición de autorización (OAuth 2.1 §4.1.1 + PKCE + RFC 8707). `registered` son las redirect URIs del
 * cliente ya resuelto (o null si el cliente no existe).
 */
export function checkAuthorizeRequest(q: Record<string, string | undefined>, registered: readonly string[] | null, expectedResource: string): AuthorizeCheck {
  if (!q.client_id) return { ok: false, redirectable: false, reason: "invalid_request" };
  if (!registered) return { ok: false, redirectable: false, reason: "invalid_client" };
  const redirectUri = q.redirect_uri;
  if (!redirectUri || !redirectUriMatches(redirectUri, registered)) return { ok: false, redirectable: false, reason: "invalid_redirect_uri" };

  if (q.response_type !== "code") return { ok: false, redirectable: true, error: "unsupported_response_type", description: "response_type must be code." };
  if (q.code_challenge_method !== "S256") return { ok: false, redirectable: true, error: "invalid_request", description: "PKCE with code_challenge_method=S256 is required." };
  if (!isValidCodeChallenge(q.code_challenge)) return { ok: false, redirectable: true, error: "invalid_request", description: "Invalid code_challenge." };
  if (q.state !== undefined && q.state.length > 1000) return { ok: false, redirectable: true, error: "invalid_request", description: "state is too long." };
  if (!resourceMatches(q.resource, expectedResource)) return { ok: false, redirectable: true, error: "invalid_target", description: "Unknown resource." };
  return {
    ok: true,
    params: { clientId: q.client_id, redirectUri, codeChallenge: q.code_challenge, state: q.state ?? null, scope: grantedScope(q.scope), resource: expectedResource },
  };
}

/** Construye la URL de vuelta al cliente con los parámetros (conserva la query de la redirect_uri registrada). */
export function buildRedirect(redirectUri: string, params: Record<string, string | null | undefined>) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

/** Valor de la cabecera WWW-Authenticate (RFC 6750 §3 + RFC 9728 §5.1). */
export function wwwAuthenticate(resourceMetadataUrl: string, opts: { error?: "invalid_token" | "insufficient_scope"; description?: string } = {}) {
  const q = (s: string) => s.replace(/["\\]/g, "");
  const parts = [`resource_metadata="${q(resourceMetadataUrl)}"`, `scope="${OAUTH_SCOPE}"`];
  if (opts.error) parts.unshift(`error="${opts.error}"`);
  if (opts.description) parts.push(`error_description="${q(opts.description)}"`);
  return `Bearer ${parts.join(", ")}`;
}
