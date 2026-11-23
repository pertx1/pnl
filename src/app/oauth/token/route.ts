import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_TTL_SECONDS,
  generateToken,
  hashToken,
  isValidCodeVerifier,
  isWellFormedToken,
  REFRESH_TTL_SECONDS,
  resourceMatches,
  s256,
} from "@/lib/mcp/oauth";
import { CORS_HEADERS, ipSubject, mcpResource } from "@/lib/mcp/oauth-server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Endpoint de token (OAuth 2.1 §3.2). Clientes públicos con PKCE S256.
 * - authorization_code: código de un solo uso (5 min); reutilizarlo revoca lo emitido con él.
 * - refresh_token: rotación en cada uso; reutilizar uno ya rotado revoca la autorización.
 * Tokens: acceso 1 h, refresco 30 días; en BD solo su hash SHA-256.
 */
const headers = { ...CORS_HEADERS, "Cache-Control": "no-store", Pragma: "no-cache" };
const err = (error: string, description: string, status = 400) => NextResponse.json({ error, error_description: description }, { status, headers });

async function readParams(request: NextRequest): Promise<Map<string, string> | null> {
  const raw = await request.text();
  if (raw.length > 10_000) return null;
  const type = request.headers.get("content-type") ?? "";
  const out = new Map<string, string>();
  if (type.includes("application/json")) {
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(j)) if (typeof v === "string") out.set(k, v);
    } catch {
      return null;
    }
  } else {
    const form = new URLSearchParams(raw);
    for (const k of new Set(form.keys())) {
      const all = form.getAll(k);
      if (all.length > 1) return null; // parámetros repetidos
      out.set(k, all[0]);
    }
  }
  // client_secret_basic: se acepta el client_id de la cabecera (los clientes de Kreo son públicos: el secreto se ignora).
  const basic = request.headers.get("authorization")?.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
  if (basic && !out.has("client_id")) {
    const id = Buffer.from(basic[1], "base64").toString("utf8").split(":")[0];
    try {
      if (id) out.set("client_id", decodeURIComponent(id));
    } catch {
      return null; // %-codificación inválida → invalid_request (no un 500)
    }
  }
  return out;
}

export async function POST(request: NextRequest) {
  const db = createAdminClient();
  if (!db) return err("temporarily_unavailable", "Authorization server not configured.", 503);
  const { data: allowed } = await db.rpc("mcp_oauth_rate_limit_hit", { p_subject: ipSubject("tok", request.headers), p_per_minute: 600, p_per_day: 50000 });
  // Límite holgado: los clientes alojados (Claude) llegan desde rangos de IP compartidos. Freno anti-abuso, no por usuario.
  if (allowed === false) return err("temporarily_unavailable", "Too many requests. Try again in a minute.", 429);

  const p = await readParams(request);
  if (!p) return err("invalid_request", "Malformed request.");
  const clientId = p.get("client_id");
  if (!clientId || clientId.length > 300) return err("invalid_client", "client_id is required.", 401);
  const resource = p.get("resource");
  if (resource && !resourceMatches(resource, mcpResource())) return err("invalid_target", "Unknown resource.");

  const access = generateToken("access");
  const refresh = generateToken("refresh");
  const grantType = p.get("grant_type");

  let result: { status: string; scope: string | null } | undefined;
  if (grantType === "authorization_code") {
    const code = p.get("code") ?? "";
    const verifier = p.get("code_verifier") ?? "";
    const redirectUri = p.get("redirect_uri") ?? "";
    if (!isWellFormedToken("code", code)) return err("invalid_grant", "Invalid authorization code.");
    if (!isValidCodeVerifier(verifier)) return err("invalid_request", "A valid code_verifier is required (PKCE).");
    if (!redirectUri) return err("invalid_request", "redirect_uri is required.");
    const { data, error } = await db.rpc("mcp_oauth_exchange_code", {
      p_code_hash: hashToken(code),
      p_client_id: clientId,
      p_redirect_uri: redirectUri,
      p_code_challenge: s256(verifier),
      p_resource: null, // ya comprobado arriba; el código siempre está ligado a este recurso
      p_access_hash: hashToken(access),
      p_refresh_hash: hashToken(refresh),
      p_access_ttl: ACCESS_TTL_SECONDS,
      p_refresh_ttl: REFRESH_TTL_SECONDS,
    });
    if (error) return err("temporarily_unavailable", "Try again later.", 503);
    result = data?.[0];
  } else if (grantType === "refresh_token") {
    const old = p.get("refresh_token") ?? "";
    if (!isWellFormedToken("refresh", old)) return err("invalid_grant", "Invalid refresh token.");
    const { data, error } = await db.rpc("mcp_oauth_refresh", {
      p_refresh_hash: hashToken(old),
      p_client_id: clientId,
      p_resource: null,
      p_access_hash: hashToken(access),
      p_refresh_hash_new: hashToken(refresh),
      p_access_ttl: ACCESS_TTL_SECONDS,
      p_refresh_ttl: REFRESH_TTL_SECONDS,
    });
    if (error) return err("temporarily_unavailable", "Try again later.", 503);
    result = data?.[0];
  } else {
    return err("unsupported_grant_type", "Use authorization_code or refresh_token.");
  }

  if (!result || result.status !== "ok") {
    return result?.status === "invalid_target" ? err("invalid_target", "Unknown resource.") : err("invalid_grant", "The code or refresh token is invalid, expired or already used.");
  }
  return NextResponse.json(
    { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SECONDS, refresh_token: refresh, scope: result.scope ?? "kreo" },
    { headers },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
