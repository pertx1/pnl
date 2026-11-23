import { NextResponse, type NextRequest } from "next/server";
import { hashToken, isWellFormedToken } from "@/lib/mcp/oauth";
import { CORS_HEADERS } from "@/lib/mcp/oauth-server";
import { createAdminClient } from "@/lib/supabase/admin";

/** RFC 7009 · Revocación. Revoca la autorización completa (acceso + refresco) del token. Siempre 200 (no revela si existía). */
export async function POST(request: NextRequest) {
  const db = createAdminClient();
  const headers = { ...CORS_HEADERS, "Cache-Control": "no-store" };
  if (!db) return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503, headers });
  const form = new URLSearchParams(await request.text());
  const token = form.get("token") ?? "";
  const clientId = form.get("client_id");
  if (isWellFormedToken("access", token) || isWellFormedToken("refresh", token)) {
    await db.rpc("mcp_oauth_revoke_token", { p_hash: hashToken(token), p_client_id: clientId && clientId.length <= 300 ? clientId : null });
  }
  return new NextResponse(null, { status: 200, headers });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
