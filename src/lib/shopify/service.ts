import "server-only";
import { appUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { accessTokenFor, shopifyGraphql, ShopifyError } from "./client";
import { minimizeGraphqlOrder, ORDER_WEBHOOK_FIELDS, type MinimalOrder } from "./core";

/** Operaciones de servidor sobre una tienda vinculada. Llamar SOLO tras comprobar permisos (o desde workers). */

function admin() {
  const a = createAdminClient();
  if (!a) throw new ShopifyError("not_configured");
  return a;
}

export async function fetchShopInfo(shop: string, token: string) {
  const data = await shopifyGraphql<{ shop: { name: string; currencyCode: string } }>(shop, token, `query { shop { name currencyCode } }`);
  return { name: data.shop.name, currency: data.shop.currencyCode };
}

/** Suscribe los webhooks de pedidos y desinstalación (los de RGPD se configuran en el panel/shopify.app.toml). */
export async function subscribeWebhooks(shop: string, token: string) {
  const uri = `${appUrl()}/api/shopify/webhooks`;
  const mutation = `mutation Sub($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) { userErrors { field message } }
  }`;
  const subs: { topic: string; includeFields?: string[] }[] = [
    { topic: "ORDERS_CREATE", includeFields: ORDER_WEBHOOK_FIELDS },
    { topic: "ORDERS_UPDATED", includeFields: ORDER_WEBHOOK_FIELDS },
    { topic: "APP_UNINSTALLED" },
  ];
  for (const s of subs) {
    // Un error aquí (p. ej. ya suscrito) no bloquea la vinculación: la sincronización periódica cubre los pedidos.
    await shopifyGraphql(shop, token, mutation, { topic: s.topic, sub: { uri, ...(s.includeFields ? { includeFields: s.includeFields } : {}) } }).catch(() => null);
  }
}

const ORDERS_QUERY = `query Orders($cursor: String, $q: String!) {
  orders(first: 100, after: $cursor, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt cancelledAt test discountCodes
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      customerJourneySummary { lastVisit { landingPage utmParameters { source medium campaign content } } }
      lineItems(first: 50) { nodes { title quantity product { id } } }
    }
  }
}`;

type OrdersPage = { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Parameters<typeof minimizeGraphqlOrder>[0][] } };

export async function upsertOrders(store: { id: string; workspace_id: string; project_id: string }, orders: MinimalOrder[]) {
  if (!orders.length) return;
  const rows = orders.map((o) => ({
    store_id: store.id,
    shopify_order_id: o.shopifyOrderId,
    workspace_id: store.workspace_id,
    project_id: store.project_id,
    order_number: o.orderNumber,
    ordered_at: o.orderedAt,
    total: o.total,
    currency: o.currency,
    discount_codes: o.discountCodes,
    landing_path: o.landingPath,
    utm_source: o.utm.source,
    utm_medium: o.utm.medium,
    utm_campaign: o.utm.campaign,
    utm_content: o.utm.content,
    line_items: o.lineItems,
    cancelled: o.cancelled,
    test: o.test,
    synced_at: new Date().toISOString(),
  }));
  const { error } = await admin().from("shopify_orders").upsert(rows, { onConflict: "store_id,shopify_order_id" });
  if (error) throw new ShopifyError("db_error");
}

/** Sincroniza los pedidos de los últimos `days` días (máx. 60: sin read_all_orders Shopify solo da 60 días). */
export async function syncOrders(storeId: string, days = 60) {
  const db = admin();
  const { data: store } = await db.from("shopify_stores").select("id, workspace_id, project_id, status").eq("id", storeId).maybeSingle();
  if (!store || store.status === "uninstalled") return { synced: 0 };
  try {
    const { shop, token } = await accessTokenFor(storeId);
    const since = new Date(Date.now() - Math.min(days, 60) * 86400000).toISOString();
    let cursor: string | null = null;
    let total = 0;
    for (let page = 0; page < 50; page++) {
      const data: OrdersPage = await shopifyGraphql<OrdersPage>(shop, token, ORDERS_QUERY, { cursor, q: `created_at:>=${since}` });
      const minimal = data.orders.nodes.map(minimizeGraphqlOrder).filter((o): o is MinimalOrder => !!o);
      await upsertOrders(store, minimal);
      total += minimal.length;
      if (!data.orders.pageInfo.hasNextPage) break;
      cursor = data.orders.pageInfo.endCursor;
    }
    await db.from("shopify_stores").update({ last_synced_at: new Date().toISOString(), sync_error: null, status: "active" }).eq("id", storeId);
    return { synced: total };
  } catch (e) {
    const code = e instanceof ShopifyError ? e.code : "unknown";
    await db.from("shopify_stores").update({ sync_error: code.slice(0, 120) }).eq("id", storeId);
    throw e;
  }
}

/** Crea un código de descuento porcentual en la tienda (Admin GraphQL `discountCodeBasicCreate`). */
export async function createDiscountCode(storeId: string, input: { code: string; title: string; percent: number; endsAt?: string | null; usageLimit?: number | null }) {
  const { shop, token } = await accessTokenFor(storeId);
  const mutation = `mutation Create($d: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $d) {
      codeDiscountNode { id }
      userErrors { field code message }
    }
  }`;
  const data = await shopifyGraphql<{ discountCodeBasicCreate: { codeDiscountNode: { id: string } | null; userErrors: { code?: string; message: string }[] } }>(shop, token, mutation, {
    d: {
      title: input.title,
      code: input.code,
      startsAt: new Date().toISOString(),
      endsAt: input.endsAt ?? null,
      usageLimit: input.usageLimit ?? null,
      appliesOncePerCustomer: true,
      context: { all: "ALL" },
      customerGets: { value: { percentage: Math.round(input.percent * 100) / 10000 }, items: { all: true } },
    },
  });
  const r = data.discountCodeBasicCreate;
  if (!r.codeDiscountNode) {
    const taken = r.userErrors.some((e) => /taken|unique|already/i.test(`${e.code} ${e.message}`));
    throw new ShopifyError(taken ? "code_taken" : "discount_failed");
  }
  return r.codeDiscountNode.id;
}

/** Desvincular desde Kreo: revoca el acceso en Shopify (best effort) y borra tokens, pedidos y atribución local de la tienda. */
export async function disconnectStore(storeId: string) {
  const db = admin();
  try {
    const { shop, token } = await accessTokenFor(storeId);
    // Revoca el token (desinstala la app de la tienda). Endpoint oficial de Shopify; si falla, el comerciante puede desinstalarla desde su admin.
    await fetch(`https://${shop}/admin/api_permissions/current.json`, {
      method: "DELETE",
      headers: { "X-Shopify-Access-Token": token },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
  } catch {
    /* sin token: no hay nada que revocar */
  }
  const { data: store } = await db.from("shopify_stores").select("project_id").eq("id", storeId).maybeSingle();
  if (store) await db.from("commerce_attributions").delete().eq("project_id", store.project_id).eq("kind", "discount");
  await db.from("shopify_stores").delete().eq("id", storeId); // cascada: tokens y pedidos
}
