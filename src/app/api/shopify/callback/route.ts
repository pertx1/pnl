import { NextResponse, type NextRequest } from "next/server";
import { inngest } from "@/inngest/client";
import { exchangeCode, missingScopes, saveShopTokens, shopifyCredentials, ShopifyError } from "@/lib/shopify/client";
import { isValidShopDomain, verifyQueryHmac } from "@/lib/shopify/core";
import { fetchShopInfo, subscribeWebhooks } from "@/lib/shopify/service";
import { readShopifyState, SHOPIFY_STATE_COOKIE } from "@/lib/shopify/state";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Vuelta del OAuth de Shopify: valida estado (anti-CSRF), HMAC y dominio de la tienda, obtiene el token offline
 * (caducable, con refresh token), comprueba permisos con la sesión del usuario y guarda la tienda + tokens cifrados.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const saved = readShopifyState(request.cookies.get(SHOPIFY_STATE_COOKIE)?.value);
  const finish = (q: string) => {
    const target = saved ? `/app/p/${saved.projectId}/shopify?${q}` : `/app?${q}`;
    const res = NextResponse.redirect(new URL(target, request.url));
    res.cookies.set(SHOPIFY_STATE_COOKIE, "", { path: "/api/shopify", maxAge: 0 });
    return res;
  };

  const creds = shopifyCredentials();
  const shop = sp.get("shop");
  if (!creds || !saved || sp.get("state") !== saved.state) return finish("error=invalid_state");
  if (!verifyQueryHmac(sp, creds.secret)) return finish("error=invalid_state");
  if (!isValidShopDomain(shop) || shop.toLowerCase() !== saved.shop) return finish("error=invalid_shop");
  const code = sp.get("code");
  if (!code) return finish("error=denied");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", request.url));
  const { data: project } = await supabase.from("projects").select("workspace_id").eq("id", saved.projectId).maybeSingle();
  if (!project) return finish("error=forbidden");
  const { data: canEdit } = await supabase.rpc("has_workspace_role", { p_workspace_id: project.workspace_id, p_min_role: "editor" });
  if (!canEdit) return finish("error=forbidden");

  const db = createAdminClient();
  if (!db) return finish("error=not_configured");

  try {
    const tokens = await exchangeCode(saved.shop, code);
    const missing = missingScopes(tokens.scopes);
    const info = await fetchShopInfo(saved.shop, tokens.accessToken);

    // Una tienda solo puede estar vinculada a un proyecto. Si ya lo está a otro, no se toca.
    const { data: existing } = await db.from("shopify_stores").select("id, project_id").eq("shop_domain", saved.shop).maybeSingle();
    if (existing && existing.project_id !== saved.projectId) return finish("error=already_linked");
    const { data: other } = await db.from("shopify_stores").select("id, shop_domain").eq("project_id", saved.projectId).maybeSingle();
    if (other && other.shop_domain !== saved.shop) return finish("error=project_has_store");

    const { data: store, error } = await db
      .from("shopify_stores")
      .upsert(
        {
          workspace_id: project.workspace_id,
          project_id: saved.projectId,
          shop_domain: saved.shop,
          shop_name: info.name.slice(0, 300),
          currency: /^[A-Z]{3}$/.test(info.currency) ? info.currency : null,
          granted_scopes: tokens.scopes,
          status: "active",
          connected_by: auth.user.id,
          sync_error: null,
          uninstalled_at: null,
        },
        { onConflict: "shop_domain" },
      )
      .select("id")
      .single();
    if (error || !store) throw new ShopifyError("db_error");
    await saveShopTokens(store.id, tokens);
    await db.from("activity_log").insert({ workspace_id: project.workspace_id, actor_id: auth.user.id, action: "shopify.connected", entity_type: "shopify_store", entity_id: store.id, metadata: {} });

    await subscribeWebhooks(saved.shop, tokens.accessToken);
    await inngest.send({ name: "shopify/store.sync", data: { storeId: store.id } }).catch(() => null);
    return finish(`connected=1${missing.length ? "&missing=1" : ""}`);
  } catch (e) {
    const code = e instanceof ShopifyError ? e.code : "unknown";
    console.error(`[shopify] OAuth falló: ${code}`);
    return finish(`error=${encodeURIComponent(code)}`);
  }
}
