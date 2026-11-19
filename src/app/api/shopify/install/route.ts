import { NextResponse, type NextRequest } from "next/server";
import { appUrl } from "@/lib/env";
import { authorizeUrl, isShopifyConfigured, shopifyCredentials } from "@/lib/shopify/client";
import { normalizeShopDomain, verifyQueryHmac } from "@/lib/shopify/core";
import { newShopifyState, SHOPIFY_STATE_COOKIE } from "@/lib/shopify/state";
import { createClient } from "@/lib/supabase/server";

/**
 * Inicia el OAuth OFICIAL de Shopify (authorization code grant) para vincular una tienda a un proyecto.
 *  - Desde Kreo: /api/shopify/install?project=<uuid>&shop=<tienda>.myshopify.com (editor+).
 *  - Desde Shopify (instalación iniciada en la tienda, con `hmac`): se verifica el HMAC y se envía al usuario a Kreo
 *    para que elija el proyecto (no se vincula nada sin sesión de Kreo).
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const projectId = sp.get("project") ?? "";
  const shop = normalizeShopDomain(sp.get("shop") ?? "");

  if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
    const creds = shopifyCredentials();
    if (sp.get("hmac") && creds && verifyQueryHmac(sp, creds.secret)) {
      return NextResponse.redirect(new URL("/app?shopify=choose_project", request.url));
    }
    return NextResponse.redirect(new URL("/app", request.url));
  }
  const back = (q: string) => NextResponse.redirect(new URL(`/app/p/${projectId}/shopify?${q}`, request.url));
  if (!isShopifyConfigured()) return back("error=not_configured");
  if (!shop) return back("error=invalid_shop");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL(`/login?next=/app/p/${projectId}/shopify`, request.url));
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", projectId).maybeSingle();
  if (!project) return back("error=forbidden");
  const { data: ok } = await supabase.rpc("has_workspace_role", { p_workspace_id: project.workspace_id, p_min_role: "editor" });
  if (!ok) return back("error=forbidden");

  const { value, cookie } = newShopifyState(projectId, shop);
  const res = NextResponse.redirect(authorizeUrl(shop, value.state, `${appUrl()}/api/shopify/callback`));
  res.cookies.set(SHOPIFY_STATE_COOKIE, cookie, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/shopify", maxAge: 600 });
  return res;
}
