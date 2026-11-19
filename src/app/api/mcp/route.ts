import { createMcpHandler, originValidationResponse } from "@modelcontextprotocol/server";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/env";
import { bearerFrom, hashApiKey, RATE_LIMIT } from "@/lib/mcp/keys";
import { createKreoMcpServer } from "@/lib/mcp/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Servidor MCP de Kreo (transporte Streamable HTTP, SDK oficial @modelcontextprotocol/server v2, sin estado).
 * Autenticación: `Authorization: Bearer kreo_sk_...` (API key personal creada en /app/settings/api-keys; en BD solo su hash).
 * Límite: 60 peticiones/min y 2.000/día por clave. Cada llamada a herramienta queda en activity_log del workspace.
 */

export const maxDuration = 60;

function unauthorized(message: string, status = 401) {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    { status, headers: status === 401 ? { "WWW-Authenticate": 'Bearer realm="kreo", error="invalid_token"' } : {} },
  );
}

async function handle(request: NextRequest) {
  // Anti DNS-rebinding: si viene de un navegador, solo desde el propio dominio de Kreo.
  const rejected = originValidationResponse(request, [new URL(appUrl()).hostname]);
  if (rejected) return rejected;

  const key = bearerFrom(request.headers.get("authorization"));
  if (!key) return unauthorized("Missing or malformed API key. Use: Authorization: Bearer kreo_sk_...");
  const db = createAdminClient();
  if (!db) return unauthorized("Kreo MCP is not configured on this server.", 503);

  const { data: row } = await db.from("mcp_api_keys").select("id, user_id, revoked_at, last_used_at").eq("key_hash", hashApiKey(key)).maybeSingle();
  if (!row || row.revoked_at) return unauthorized("Invalid or revoked API key.");

  const { data: allowed } = await db.rpc("mcp_rate_limit_hit", { p_key_id: row.id, p_per_minute: RATE_LIMIT.perMinute, p_per_day: RATE_LIMIT.perDay });
  if (allowed === false) {
    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32029, message: "Rate limit exceeded. Try again in a minute." }, id: null }, { status: 429, headers: { "Retry-After": "60" } });
  }
  // last_used_at con resolución de 1 min (evita una escritura por petición).
  if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 60_000) {
    await db.from("mcp_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  }

  const handler = createMcpHandler(() => createKreoMcpServer({ userId: row.user_id, keyId: row.id, db }), {
    onerror: () => console.error("[mcp] request error"),
  });
  return handler.fetch(request, { authInfo: { token: row.id, clientId: row.id, scopes: ["kreo"], extra: { userId: row.user_id } } });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
