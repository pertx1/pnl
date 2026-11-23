import "server-only";
import { createHmac } from "node:crypto";
import { appUrl } from "@/lib/env";
import type { createAdminClient } from "@/lib/supabase/admin";
import { isCimdClientId, isDcrClientId, parseCimdDocument, SUPPORTED_SCOPES, type ClientMetadata } from "./oauth";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/**
 * Piezas de servidor del OAuth del MCP: URLs, metadatos de descubrimiento, resolución de clientes (DCR o CIMD) y
 * límites por IP. El emisor (issuer) es la propia app y el recurso protegido es `${appUrl()}/api/mcp`.
 */
export function issuer() {
  return appUrl();
}
export function mcpResource() {
  return `${appUrl()}/api/mcp`;
}
export function resourceMetadataUrl() {
  return `${appUrl()}/.well-known/oauth-protected-resource/api/mcp`;
}

/** RFC 9728 · Protected Resource Metadata. */
export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [issuer()],
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Kreo",
    resource_documentation: `${appUrl()}/app/settings/api-keys#connect`,
  };
}

/** RFC 8414 · Authorization Server Metadata (+ CIMD, RFC 9207 `iss`, RFC 7009). */
export function authorizationServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    scopes_supported: [...SUPPORTED_SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${base}/app/settings/api-keys#connect`,
  };
}

/** CORS abierto para los endpoints públicos de OAuth (sin cookies): necesario para clientes MCP en navegador. */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
} as const;

/** Hosts cuyos Client ID Metadata Documents se aceptan (lista cerrada → sin SSRF). Por defecto, los de Claude. */
export function cimdAllowedHosts() {
  return (process.env.MCP_CIMD_ALLOWED_HOSTS ?? "claude.ai,claude.com")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

const CIMD_TTL_MS = 6 * 60 * 60 * 1000;

/** Descarga un documento CIMD: solo https, sin redirecciones, 5 s, máx. 10 KB, JSON. */
async function fetchCimd(url: string): Promise<ClientMetadata | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { redirect: "error", signal: ctrl.signal, headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    if (Number(res.headers.get("content-length") ?? 0) > 10_000) return null; // no descargar cuerpos grandes
    const text = await res.text();
    if (text.length > 10_000) return null;
    return parseCimdDocument(JSON.parse(text), url);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type ResolvedClient = { clientId: string; kind: "dcr" | "cimd"; name: string; redirectUris: string[] };

/** Busca el cliente: registrado por DCR, o documento CIMD (cacheado 6 h en BD) de un host permitido. */
export async function resolveClient(db: Admin, clientId: string | undefined): Promise<ResolvedClient | null> {
  if (!clientId) return null;
  const dcr = isDcrClientId(clientId);
  const cimd = !dcr && isCimdClientId(clientId, cimdAllowedHosts());
  if (!dcr && !cimd) return null;

  const { data: row } = await db.from("mcp_oauth_clients").select("client_id, kind, client_name, redirect_uris, metadata_fetched_at").eq("client_id", clientId).maybeSingle();
  if (dcr) return row && row.kind === "dcr" ? { clientId, kind: "dcr", name: row.client_name, redirectUris: row.redirect_uris } : null;

  const fresh = row?.metadata_fetched_at && Date.now() - new Date(row.metadata_fetched_at).getTime() < CIMD_TTL_MS;
  if (row && fresh) return { clientId, kind: "cimd", name: row.client_name, redirectUris: row.redirect_uris };
  const meta = await fetchCimd(clientId);
  if (!meta) return row ? { clientId, kind: "cimd", name: row.client_name, redirectUris: row.redirect_uris } : null; // caché caducada pero válida: mejor que cortar
  const now = new Date().toISOString();
  await db
    .from("mcp_oauth_clients")
    .upsert({ client_id: clientId, kind: "cimd", client_name: meta.clientName, client_uri: meta.clientUri, redirect_uris: meta.redirectUris, metadata_fetched_at: now }, { onConflict: "client_id" });
  return { clientId, kind: "cimd", name: meta.clientName, redirectUris: meta.redirectUris };
}

/**
 * Sujeto para limitar peticiones anónimas (registro, token) por IP SIN guardar la IP: HMAC truncado con una clave del
 * servidor. Se borra a los 2 días (mcp_oauth_rate_limits).
 */
export function ipSubject(prefix: string, headers: Headers) {
  const ip = headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = process.env.MCP_OAUTH_RATE_SALT ?? process.env.SUPABASE_SECRET_KEY ?? "kreo";
  return `${prefix}:${createHmac("sha256", key).update(ip).digest("base64url").slice(0, 22)}`;
}

/** Cookie con la petición de autorización pendiente mientras el usuario inicia sesión / verifica 2FA / da su consentimiento. */
export const AUTH_REQUEST_COOKIE = "kreo_oauth_req";
export const CONSENT_PATH = "/oauth/consent";
