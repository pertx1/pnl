import "server-only";
import { decryptToken, encryptToken, isCryptoConfigured } from "@/lib/crypto/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { SHOPIFY_API_VERSION, SHOPIFY_SCOPES } from "./core";

/**
 * Cliente OFICIAL de Shopify: OAuth (authorization code grant con token offline caducable, `expiring=1`)
 * y Admin GraphQL API. Sin SHOPIFY_API_KEY/SHOPIFY_API_SECRET → "pendiente de configurar".
 * Los tokens se guardan cifrados (AES-256-GCM) en `shopify_store_tokens` (sin políticas RLS: solo service_role).
 */

export class ShopifyError extends Error {
  constructor(
    public code: string,
    public status?: number,
  ) {
    super(code);
  }
}

export function shopifyCredentials() {
  const key = process.env.SHOPIFY_API_KEY;
  const secret = process.env.SHOPIFY_API_SECRET;
  return key && secret ? { key, secret } : null;
}

/** Shopify listo para vincular tiendas: credenciales de la app + cifrado + clave de servidor de Supabase. */
export function isShopifyConfigured() {
  return !!shopifyCredentials() && isCryptoConfigured() && !!process.env.SUPABASE_SECRET_KEY;
}

export function authorizeUrl(shop: string, state: string, redirectUri: string) {
  const creds = shopifyCredentials()!;
  const p = new URLSearchParams({ client_id: creds.key, scope: SHOPIFY_SCOPES.join(","), redirect_uri: redirectUri, state });
  return `https://${shop}/admin/oauth/authorize?${p.toString()}`;
}

export type ShopTokens = { accessToken: string; refreshToken?: string; accessExpiresAt?: Date; refreshExpiresAt?: Date; scopes: string[] };

async function tokenRequest(shop: string, body: Record<string, string>): Promise<ShopTokens> {
  const creds = shopifyCredentials();
  if (!creds) throw new ShopifyError("not_configured");
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: creds.key, client_secret: creds.secret, ...body }).toString(),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    scope?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  } | null;
  if (!res.ok || !json?.access_token) throw new ShopifyError(res.status === 401 ? "invalid_grant" : "token_exchange_failed", res.status);
  const now = Date.now();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    accessExpiresAt: json.expires_in ? new Date(now + json.expires_in * 1000) : undefined,
    refreshExpiresAt: json.refresh_token_expires_in ? new Date(now + json.refresh_token_expires_in * 1000) : undefined,
    scopes: (json.scope ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

/** Intercambia el código por un token OFFLINE caducable (obligatorio para apps públicas nuevas). */
export function exchangeCode(shop: string, code: string) {
  return tokenRequest(shop, { code, expiring: "1" });
}

export function refreshTokens(shop: string, refreshToken: string) {
  return tokenRequest(shop, { grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Un scope `write_x` incluye `read_x`. Devuelve los scopes pedidos que faltan. */
export function missingScopes(granted: string[]) {
  const g = new Set(granted);
  return SHOPIFY_SCOPES.filter((s) => !g.has(s) && !(s.startsWith("read_") && g.has(`write_${s.slice(5)}`)));
}

// -------------------------------------------------------------------------------------------------
// Tokens
// -------------------------------------------------------------------------------------------------
function admin() {
  const a = createAdminClient();
  if (!a) throw new ShopifyError("not_configured");
  return a;
}

export async function saveShopTokens(storeId: string, t: ShopTokens) {
  const { error } = await admin()
    .from("shopify_store_tokens")
    .upsert({
      store_id: storeId,
      access_token_enc: encryptToken(t.accessToken),
      refresh_token_enc: t.refreshToken ? encryptToken(t.refreshToken) : null,
      access_expires_at: t.accessExpiresAt?.toISOString() ?? null,
      refresh_expires_at: t.refreshExpiresAt?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new ShopifyError("token_store_failed");
}

/** Token de acceso vigente de una tienda (lo refresca si caduca en < 5 min). Marca la tienda en error si no se puede. */
export async function accessTokenFor(storeId: string): Promise<{ shop: string; token: string }> {
  const db = admin();
  const [{ data: store }, { data: tok }] = await Promise.all([
    db.from("shopify_stores").select("shop_domain, status").eq("id", storeId).maybeSingle(),
    db.from("shopify_store_tokens").select("*").eq("store_id", storeId).maybeSingle(),
  ]);
  if (!store || store.status === "uninstalled" || !tok) throw new ShopifyError("not_connected");
  const expiresSoon = tok.access_expires_at && new Date(tok.access_expires_at).getTime() < Date.now() + 5 * 60_000;
  if (!expiresSoon) return { shop: store.shop_domain, token: decryptToken(tok.access_token_enc) };
  if (!tok.refresh_token_enc) throw new ShopifyError("token_expired");
  try {
    const fresh = await refreshTokens(store.shop_domain, decryptToken(tok.refresh_token_enc));
    await saveShopTokens(storeId, fresh);
    return { shop: store.shop_domain, token: fresh.accessToken };
  } catch (e) {
    if (e instanceof ShopifyError && e.code === "invalid_grant") {
      // Shopify: 401 al refrescar → borrar tokens y pedir reautorización.
      await db.from("shopify_store_tokens").delete().eq("store_id", storeId);
      await db.from("shopify_stores").update({ status: "error", sync_error: "reauthorize" }).eq("id", storeId);
    }
    throw new ShopifyError("token_expired");
  }
}

// -------------------------------------------------------------------------------------------------
// Admin GraphQL API (timeout, backoff ante 429/5xx/THROTTLED, máx. 3 intentos; nunca en bucle)
// -------------------------------------------------------------------------------------------------
export async function shopifyGraphql<T>(shop: string, token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  let lastStatus: number | undefined;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      lastStatus = res.status;
      if (res.status === 401 || res.status === 403) throw new ShopifyError("unauthorized", res.status);
      if (res.status !== 429 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { data?: T; errors?: { extensions?: { code?: string } }[] } | null;
        const throttled = body?.errors?.some((e) => e.extensions?.code === "THROTTLED");
        if (!throttled) {
          if (!body?.data) throw new ShopifyError("bad_response", res.status);
          return body.data;
        }
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      if (i < 2) await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 1000 * 2 ** i));
    } catch (e) {
      if (e instanceof ShopifyError) throw e;
      if (i < 2) await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw new ShopifyError(lastStatus === 429 ? "rate_limited" : "unavailable", lastStatus);
}
