import { NextResponse, type NextRequest } from "next/server";
import { CONSENT_COOKIE, hasMarketingConsent, normalizeAffiliateCode, REF_COOKIE, REF_COOKIE_MAX_AGE } from "@/lib/affiliates";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Enlace de afiliado /r/<código> → registro (/signup?ref=<código>). No va a la landing porque allí ?ref es el
 * código de la lista de espera.
 *  - Cuenta el clic en un contador agregado por día (sin IP, user agent ni datos personales).
 *  - Cookie de atribución `kreo_ref` SOLO si hay consentimiento de marketing (cookie kreo_consent).
 *  - Siempre añade `?ref=<código>`: es el "referido declarado" que el registro guarda sin cookie.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeAffiliateCode(raw);
  const target = new URL("/", request.nextUrl.origin);
  if (!code) return NextResponse.redirect(target, 302);

  // Prefetch de navegadores/previsualizaciones: no cuentan como clic.
  const purpose = request.headers.get("purpose") ?? request.headers.get("sec-purpose") ?? "";
  let valid = true;
  if (!/prefetch|preview/i.test(purpose)) {
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin.rpc("record_affiliate_click", { p_code: code });
      valid = data !== false;
    }
  }
  if (!valid) return NextResponse.redirect(target, 302);

  target.pathname = "/signup";
  target.searchParams.set("ref", code);
  const res = NextResponse.redirect(target, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  if (hasMarketingConsent(request.cookies.get(CONSENT_COOKIE)?.value)) {
    res.cookies.set(REF_COOKIE, code, {
      path: "/",
      maxAge: REF_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return res;
}
