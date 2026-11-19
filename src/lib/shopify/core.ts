import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Lógica PURA de Shopify (sin red ni BD): validación de dominio, HMAC de OAuth y webhooks,
 * minimización de pedidos y atribución. Probada en tests/unit/commerce.test.ts.
 */

/** Versión estable de la Admin GraphQL API (verificada en shopify.dev el 2026-11-19). */
export const SHOPIFY_API_VERSION = "2026-10";

/** Scopes mínimos: productos y pedidos (lectura), descuentos (crear códigos de atribución). */
export const SHOPIFY_SCOPES = ["read_products", "read_orders", "read_discounts", "write_discounts"] as const;

const SHOP_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

/** Normaliza lo que escribe el usuario ("mi-tienda", "https://mi-tienda.myshopify.com/") → "mi-tienda.myshopify.com" o null. */
export function normalizeShopDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!s) return null;
  if (!s.includes(".")) s = `${s}.myshopify.com`;
  return SHOP_RE.test(s) && s.length <= 120 ? s : null;
}

export function isValidShopDomain(s: string | null | undefined): s is string {
  return !!s && SHOP_RE.test(s) && s.length <= 120;
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * HMAC de la query que Shopify añade a la vuelta del OAuth (y al abrir la app):
 * quitar `hmac`, ordenar el resto alfabéticamente, unir `k=v` con `&` y HMAC-SHA256 (hex) con el client secret.
 */
export function verifyQueryHmac(params: URLSearchParams, secret: string): boolean {
  const hmac = params.get("hmac");
  if (!hmac || !secret) return false;
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  return safeEqual(digest, hmac.toLowerCase());
}

/** HMAC de un webhook: cabecera X-Shopify-Hmac-Sha256 = base64(HMAC-SHA256(cuerpo crudo, client secret)). */
export function verifyWebhookHmac(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return safeEqual(digest, header);
}

// -------------------------------------------------------------------------------------------------
// Pedidos minimizados (sin datos personales de clientes)
// -------------------------------------------------------------------------------------------------
export type LineItem = { productId: string | null; title: string; quantity: number };
export type MinimalOrder = {
  shopifyOrderId: number;
  orderNumber: string | null;
  orderedAt: string;
  total: number;
  currency: string;
  discountCodes: string[];
  landingPath: string | null;
  utm: { source: string | null; medium: string | null; campaign: string | null; content: string | null };
  lineItems: LineItem[];
  cancelled: boolean;
  test: boolean;
};

const clip = (s: unknown, n: number) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null);

/** Extrae solo la ruta y los parámetros UTM de una URL de aterrizaje (descarta cualquier otro parámetro: pueden llevar datos personales). */
export function parseLanding(url: string | null | undefined): { path: string | null; utm: MinimalOrder["utm"] } {
  const empty = { path: null, utm: { source: null, medium: null, campaign: null, content: null } };
  if (!url) return empty;
  try {
    const u = new URL(url, "https://shop.invalid");
    const p = u.searchParams;
    return {
      path: clip(u.pathname, 500),
      utm: { source: clip(p.get("utm_source"), 200), medium: clip(p.get("utm_medium"), 200), campaign: clip(p.get("utm_campaign"), 200), content: clip(p.get("utm_content"), 200) },
    };
  } catch {
    return empty;
  }
}

/** "gid://shopify/Order/123" → 123 */
export function gidToNumber(gid: unknown): number | null {
  if (typeof gid === "number" && Number.isSafeInteger(gid)) return gid;
  if (typeof gid !== "string") return null;
  const m = gid.match(/(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

const money = (v: unknown) => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const currencyOf = (v: unknown) => (typeof v === "string" && /^[A-Z]{3}$/.test(v) ? v : "XXX");

type GqlOrderNode = {
  id: string;
  name?: string | null;
  createdAt: string;
  cancelledAt?: string | null;
  test?: boolean;
  discountCodes?: string[];
  currentTotalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
  customerJourneySummary?: { lastVisit?: { landingPage?: string | null; utmParameters?: { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null } | null } | null } | null;
  lineItems?: { nodes?: { title?: string; quantity?: number; product?: { id?: string } | null }[] };
};

/** Pedido de la Admin GraphQL API → fila minimizada. Ignora cualquier campo de cliente aunque viniera. */
export function minimizeGraphqlOrder(o: GqlOrderNode): MinimalOrder | null {
  const id = gidToNumber(o.id);
  if (!id || !o.createdAt) return null;
  const visit = o.customerJourneySummary?.lastVisit ?? null;
  const landing = parseLanding(visit?.landingPage ?? null);
  const u = visit?.utmParameters;
  return {
    shopifyOrderId: id,
    orderNumber: clip(o.name, 40),
    orderedAt: o.createdAt,
    total: money(o.currentTotalPriceSet?.shopMoney?.amount),
    currency: currencyOf(o.currentTotalPriceSet?.shopMoney?.currencyCode),
    discountCodes: normalizeCodes(o.discountCodes ?? []),
    landingPath: landing.path,
    utm: {
      source: clip(u?.source, 200) ?? landing.utm.source,
      medium: clip(u?.medium, 200) ?? landing.utm.medium,
      campaign: clip(u?.campaign, 200) ?? landing.utm.campaign,
      content: clip(u?.content, 200) ?? landing.utm.content,
    },
    lineItems: (o.lineItems?.nodes ?? []).slice(0, 50).map((li) => ({
      productId: li.product?.id ? String(gidToNumber(li.product.id) ?? "") || null : null,
      title: clip(li.title, 200) ?? "—",
      quantity: Math.max(0, Math.trunc(li.quantity ?? 0)),
    })),
    cancelled: !!o.cancelledAt,
    test: !!o.test,
  };
}

type WebhookOrder = {
  id?: number;
  name?: string;
  created_at?: string;
  cancelled_at?: string | null;
  test?: boolean;
  current_total_price?: string;
  total_price?: string;
  currency?: string;
  discount_codes?: { code?: string }[];
  landing_site?: string | null;
  line_items?: { product_id?: number | null; title?: string; quantity?: number }[];
};

/** Payload REST de un webhook orders/create|updated → fila minimizada (lista blanca de campos). */
export function minimizeWebhookOrder(o: WebhookOrder): MinimalOrder | null {
  const id = gidToNumber(o.id);
  if (!id || !o.created_at) return null;
  const landing = parseLanding(o.landing_site ?? null);
  return {
    shopifyOrderId: id,
    orderNumber: clip(o.name, 40),
    orderedAt: o.created_at,
    total: money(o.current_total_price ?? o.total_price),
    currency: currencyOf(o.currency),
    discountCodes: normalizeCodes((o.discount_codes ?? []).map((d) => d.code ?? "")),
    landingPath: landing.path,
    utm: landing.utm,
    lineItems: (o.line_items ?? []).slice(0, 50).map((li) => ({
      productId: li.product_id ? String(li.product_id) : null,
      title: clip(li.title, 200) ?? "—",
      quantity: Math.max(0, Math.trunc(li.quantity ?? 0)),
    })),
    cancelled: !!o.cancelled_at,
    test: !!o.test,
  };
}

/** Campos del webhook de pedidos que pedimos a Shopify (`includeFields`): nada de cliente, emails ni direcciones. */
export const ORDER_WEBHOOK_FIELDS = ["id", "name", "created_at", "cancelled_at", "test", "current_total_price", "currency", "discount_codes", "landing_site", "line_items"];

// -------------------------------------------------------------------------------------------------
// Atribución
// -------------------------------------------------------------------------------------------------
export function normalizeCodes(codes: string[]): string[] {
  return [...new Set(codes.map((c) => c.trim().toUpperCase()).filter((c) => c && c.length <= 60))].slice(0, 10);
}

/** Código de descuento válido para Kreo: A-Z, 0-9, guion y guion bajo, 3-40 caracteres. */
export function sanitizeDiscountCode(input: string): string | null {
  const c = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9_-]/g, "");
  return c.length >= 3 && c.length <= 40 ? c : null;
}

/** Valor UTM legible y seguro ("Ana García" → "ana-garcia"). */
export function slugify(input: string, max = 60): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

/** Añade los parámetros UTM a una URL de destino (solo https). Conserva los parámetros que ya tuviera. */
export function buildUtmUrl(base: string, utm: { source: string; medium: string; campaign: string; content?: string | null }): string | null {
  let u: URL;
  try {
    u = new URL(base.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  u.searchParams.set("utm_source", utm.source);
  u.searchParams.set("utm_medium", utm.medium);
  u.searchParams.set("utm_campaign", utm.campaign);
  if (utm.content) u.searchParams.set("utm_content", utm.content);
  const s = u.toString();
  return s.length <= 2000 ? s : null;
}

export type AttributionRule = { id: string; kind: "utm" | "discount"; utmCampaign: string | null; discountCode: string | null };
export type OrderForAttribution = { total: number; currency: string; discountCodes: string[]; utmCampaign: string | null; cancelled: boolean; test: boolean };

/**
 * Ventas atribuidas por regla. Un pedido cuenta para un código si lo usó, y para un enlace UTM si su utm_campaign coincide.
 * Si un pedido encaja con varias reglas, cuenta en todas (se indica en la UI: no se suman entre reglas).
 * Se excluyen pedidos de prueba y cancelados.
 */
export function attributeOrders(rules: AttributionRule[], orders: OrderForAttribution[]) {
  const out = new Map<string, { orders: number; revenue: Record<string, number> }>();
  for (const r of rules) out.set(r.id, { orders: 0, revenue: {} });
  for (const o of orders) {
    if (o.test || o.cancelled) continue;
    const codes = new Set(o.discountCodes.map((c) => c.toUpperCase()));
    for (const r of rules) {
      const hit = r.kind === "discount" ? !!r.discountCode && codes.has(r.discountCode.toUpperCase()) : !!r.utmCampaign && o.utmCampaign === r.utmCampaign;
      if (!hit) continue;
      const agg = out.get(r.id)!;
      agg.orders++;
      agg.revenue[o.currency] = Math.round(((agg.revenue[o.currency] ?? 0) + o.total) * 100) / 100;
    }
  }
  return out;
}

/** Totales de ventas por día y productos top (para la página de Shopify, el MCP y el informe). */
export function salesSummary(orders: { orderedAt: string; total: number; currency: string; cancelled: boolean; test: boolean; lineItems: LineItem[] }[]) {
  const valid = orders.filter((o) => !o.test && !o.cancelled);
  const currencies = new Map<string, number>();
  for (const o of valid) currencies.set(o.currency, (currencies.get(o.currency) ?? 0) + 1);
  const currency = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const main = valid.filter((o) => o.currency === currency);
  const revenue = Math.round(main.reduce((s, o) => s + o.total, 0) * 100) / 100;
  const byDay = new Map<string, number>();
  for (const o of main) {
    const d = o.orderedAt.slice(0, 10);
    byDay.set(d, Math.round(((byDay.get(d) ?? 0) + o.total) * 100) / 100);
  }
  const products = new Map<string, { title: string; quantity: number; orders: number }>();
  for (const o of valid) {
    for (const li of o.lineItems) {
      const key = li.productId ?? li.title;
      const p = products.get(key) ?? { title: li.title, quantity: 0, orders: 0 };
      p.quantity += li.quantity;
      p.orders++;
      products.set(key, p);
    }
  }
  return {
    currency,
    orders: valid.length,
    revenue,
    aov: main.length ? Math.round((revenue / main.length) * 100) / 100 : 0,
    otherCurrencies: currencies.size > 1,
    byDay: [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, value]) => ({ day, value })),
    topProducts: [...products.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
  };
}
