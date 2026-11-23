import { NextResponse, type NextRequest } from "next/server";
import { generateClientId, parseRegistrationRequest } from "@/lib/mcp/oauth";
import { CORS_HEADERS, ipSubject } from "@/lib/mcp/oauth-server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * RFC 7591 · Registro dinámico de clientes (lo usa Claude si no usa su Client ID Metadata Document).
 * Solo clientes PÚBLICOS (token_endpoint_auth_method "none" + PKCE): no se emiten client_secret.
 * Límite por IP (hash, sin guardar la IP) y limpieza de registros que nunca se usaron.
 */
const headers = { ...CORS_HEADERS, "Cache-Control": "no-store" };
const err = (error: string, description: string, status = 400) => NextResponse.json({ error, error_description: description }, { status, headers });

export async function POST(request: NextRequest) {
  const db = createAdminClient();
  if (!db) return err("temporarily_unavailable", "Authorization server not configured.", 503);
  const { data: allowed } = await db.rpc("mcp_oauth_rate_limit_hit", { p_subject: ipSubject("reg", request.headers), p_per_minute: 60, p_per_day: 2000 });
  if (allowed === false) return err("temporarily_unavailable", "Too many registrations. Try again later.", 429);

  const raw = await request.text();
  if (raw.length > 10_000) return err("invalid_client_metadata", "Body too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return err("invalid_client_metadata", "Body must be JSON.");
  }
  const parsed = parseRegistrationRequest(body);
  if (!parsed.ok) return err(parsed.error, parsed.description);

  const clientId = generateClientId();
  const { error } = await db
    .from("mcp_oauth_clients")
    .insert({ client_id: clientId, kind: "dcr", client_name: parsed.meta.clientName, client_uri: parsed.meta.clientUri, redirect_uris: parsed.meta.redirectUris });
  if (error) return err("temporarily_unavailable", "Could not register the client.", 503);
  // Limpieza perezosa: registros dinámicos de hace más de 7 días que nunca llegaron a conectarse.
  await db.from("mcp_oauth_clients").delete().eq("kind", "dcr").is("last_used_at", null).lt("created_at", new Date(Date.now() - 7 * 86400_000).toISOString());

  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: parsed.meta.clientName,
      ...(parsed.meta.clientUri ? { client_uri: parsed.meta.clientUri } : {}),
      redirect_uris: parsed.meta.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201, headers },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
