import { createMcpHandler, originValidationResponse } from "@modelcontextprotocol/server";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/env";
import { hashApiKey, isWellFormedKey, RATE_LIMIT } from "@/lib/mcp/keys";
import { hashToken, isWellFormedToken, OAUTH_SCOPE, resourceMatches, wwwAuthenticate } from "@/lib/mcp/oauth";
import { mcpResource, resourceMetadataUrl } from "@/lib/mcp/oauth-server";
import { createKreoMcpServer, type McpContext } from "@/lib/mcp/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Servidor MCP de Kreo (transporte Streamable HTTP, SDK oficial @modelcontextprotocol/server v2, sin estado).
 * Autenticación (cabecera Authorization: Bearer …):
 *  - Token OAuth 2.1 (`kreo_at_…`) emitido por el servidor de autorización de Kreo (conectores de Claude.ai, móvil y escritorio).
 *    Ligado a usuario + workspace + cliente + este recurso (RFC 8707); caduca en 1 h.
 *  - API key personal (`kreo_sk_…`) creada en /app/settings/api-keys (Claude Code y clientes con cabeceras).
 * Sin credencial válida → 401 con WWW-Authenticate apuntando a los metadatos del recurso (RFC 9728), como exige la
 * especificación MCP. Límite: 60 peticiones/min y 2.000/día por API key o por usuario (OAuth). Cada llamada a una
 * herramienta queda en activity_log del workspace (sin datos personales).
 */

export const maxDuration = 60;

function unauthorized(description: string, hasToken: boolean) {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32001, message: description }, id: null },
    { status: 401, headers: { "WWW-Authenticate": wwwAuthenticate(resourceMetadataUrl(), hasToken ? { error: "invalid_token", description } : {}) } },
  );
}

const rateLimited = () =>
  NextResponse.json({ jsonrpc: "2.0", error: { code: -32029, message: "Rate limit exceeded. Try again in a minute." }, id: null }, { status: 429, headers: { "Retry-After": "60" } });

async function handle(request: NextRequest) {
  // Anti DNS-rebinding: si viene de un navegador, solo desde el propio dominio de Kreo.
  const rejected = originValidationResponse(request, [new URL(appUrl()).hostname]);
  if (rejected) return rejected;

  const m = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  const token = m?.[1] ?? null;
  if (!token) return unauthorized("Authentication required. Connect Kreo with OAuth or use a personal API key.", false);
  if (!isWellFormedToken("access", token) && !isWellFormedKey(token)) return unauthorized("Invalid access token.", true);
  const db = createAdminClient();
  if (!db) return NextResponse.json({ jsonrpc: "2.0", error: { code: -32001, message: "Kreo MCP is not configured on this server." }, id: null }, { status: 503 });

  let ctx: McpContext;
  if (isWellFormedToken("access", token)) {
    const { data } = await db.rpc("mcp_oauth_verify_access", { p_hash: hashToken(token) });
    const g = data?.[0];
    // Audiencia: el token debe haberse emitido para ESTE servidor MCP (RFC 8707 / especificación MCP).
    if (!g || !resourceMatches(g.resource, mcpResource()) || !g.scope.split(" ").includes(OAUTH_SCOPE)) return unauthorized("Invalid or expired access token.", true);
    const { data: allowed } = await db.rpc("mcp_oauth_rate_limit_hit", { p_subject: `user:${g.user_id}`, p_per_minute: RATE_LIMIT.perMinute, p_per_day: RATE_LIMIT.perDay });
    if (allowed === false) return rateLimited();
    ctx = { userId: g.user_id, keyId: g.grant_id, via: "oauth", workspaceId: g.workspace_id, db };
  } else if (isWellFormedKey(token)) {
    const { data: row } = await db.from("mcp_api_keys").select("id, user_id, revoked_at, last_used_at").eq("key_hash", hashApiKey(token)).maybeSingle();
    if (!row || row.revoked_at) return unauthorized("Invalid or revoked API key.", true);
    const { data: allowed } = await db.rpc("mcp_rate_limit_hit", { p_key_id: row.id, p_per_minute: RATE_LIMIT.perMinute, p_per_day: RATE_LIMIT.perDay });
    if (allowed === false) return rateLimited();
    // last_used_at con resolución de 1 min (evita una escritura por petición).
    if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 60_000) {
      await db.from("mcp_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
    }
    ctx = { userId: row.user_id, keyId: row.id, via: "api_key", workspaceId: null, db };
  } else {
    return unauthorized("Invalid access token.", true);
  }

  const handler = createMcpHandler(() => createKreoMcpServer(ctx), { onerror: () => console.error("[mcp] request error") });
  return handler.fetch(request, { authInfo: { token: ctx.keyId, clientId: ctx.keyId, scopes: [OAUTH_SCOPE], extra: { userId: ctx.userId } } });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
