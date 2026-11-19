import "server-only";
import { randomToken, sign, verify } from "@/lib/crypto/tokens";

/** Estado OAuth de Shopify firmado (HMAC) en cookie httpOnly de 10 min: anti-CSRF + liga proyecto y tienda. */
export type ShopifyState = { state: string; projectId: string; shop: string; exp: number };

export const SHOPIFY_STATE_COOKIE = "kreo_oauth_shopify";

export function newShopifyState(projectId: string, shop: string) {
  const value: ShopifyState = { state: randomToken(24), projectId, shop, exp: Date.now() + 10 * 60 * 1000 };
  return { value, cookie: sign(Buffer.from(JSON.stringify(value)).toString("base64url")) };
}

export function readShopifyState(cookie: string | undefined): ShopifyState | null {
  if (!cookie) return null;
  const raw = verify(cookie);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as ShopifyState;
    return parsed.exp > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}
