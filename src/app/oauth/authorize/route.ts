import { NextResponse, type NextRequest } from "next/server";
import { buildRedirect, checkAuthorizeRequest } from "@/lib/mcp/oauth";
import { AUTH_REQUEST_COOKIE, CONSENT_PATH, issuer, mcpResource, resolveClient } from "@/lib/mcp/oauth-server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Endpoint de autorización (OAuth 2.1 §4.1.1). Valida la petición y la guarda en una cookie httpOnly de 10 min;
 * después lleva al usuario a la pantalla de consentimiento (iniciando sesión y 2FA antes si hace falta).
 * Si client_id o redirect_uri no son válidos NUNCA se redirige al cliente (evita open redirect).
 */
export async function GET(request: NextRequest) {
  const errorPage = (reason: string) => NextResponse.redirect(new URL(`/oauth/error?reason=${reason}`, request.url));
  const db = createAdminClient();
  if (!db) return errorPage("not_configured");

  const sp = request.nextUrl.searchParams;
  const q: Record<string, string | undefined> = {};
  for (const key of ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"]) {
    const all = sp.getAll(key);
    if (all.length > 1) return errorPage("invalid_request"); // parámetros repetidos: petición mal formada (RFC 6749 §3.1)
    q[key] = all[0];
  }

  const client = await resolveClient(db, q.client_id);
  const check = checkAuthorizeRequest(q, client?.redirectUris ?? null, mcpResource());
  if (!check.ok && !check.redirectable) return errorPage(check.reason);
  if (!check.ok) {
    return NextResponse.redirect(buildRedirect(q.redirect_uri!, { error: check.error, error_description: check.description, state: q.state, iss: issuer() }));
  }

  const res = NextResponse.redirect(new URL(CONSENT_PATH, request.url));
  res.cookies.set(AUTH_REQUEST_COOKIE, Buffer.from(JSON.stringify(check.params)).toString("base64url"), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
