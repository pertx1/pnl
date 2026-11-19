import { NextResponse, type NextRequest } from "next/server";
import { shopifyCredentials } from "@/lib/shopify/client";
import { isValidShopDomain, minimizeWebhookOrder, verifyWebhookHmac } from "@/lib/shopify/core";
import { upsertOrders } from "@/lib/shopify/service";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhooks de Shopify (un solo endpoint; el tema va en X-Shopify-Topic). Todos con verificación HMAC (401 si falla).
 *  - Obligatorios de RGPD: customers/data_request, customers/redact, shop/redact.
 *  - app/uninstalled: borra los tokens al momento.
 *  - orders/create, orders/updated: guarda el pedido MINIMIZADO (sin datos de cliente).
 * Responde rápido (200) y no registra el contenido del payload.
 */
export async function POST(request: NextRequest) {
  const creds = shopifyCredentials();
  const raw = await request.text();
  if (!creds || !verifyWebhookHmac(raw, request.headers.get("x-shopify-hmac-sha256"), creds.secret)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const topic = (request.headers.get("x-shopify-topic") ?? "").toLowerCase();
  const shop = (request.headers.get("x-shopify-shop-domain") ?? "").toLowerCase();
  const db = createAdminClient();
  if (!db) return new NextResponse("not configured", { status: 503 }); // Shopify reintentará
  if (!isValidShopDomain(shop)) return NextResponse.json({ ok: true });

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const { data: store } = await db.from("shopify_stores").select("id, workspace_id, project_id, status").eq("shop_domain", shop).maybeSingle();
  const log = (action: string, metadata: Record<string, string | number> = {}) =>
    store ? db.from("activity_log").insert({ workspace_id: store.workspace_id, action, entity_type: "shopify_store", entity_id: store.id, metadata }) : null;

  switch (topic) {
    case "app/uninstalled": {
      if (store) {
        await db.from("shopify_store_tokens").delete().eq("store_id", store.id);
        await db.from("shopify_stores").update({ status: "uninstalled", uninstalled_at: new Date().toISOString() }).eq("id", store.id);
        await log("shopify.uninstalled");
      }
      break;
    }
    case "shop/redact": {
      // 48 h después de desinstalar: borrar TODO lo de la tienda (cascada: tokens y pedidos). Atribuciones del proyecto: solo códigos de esa tienda.
      if (store) {
        await log("shopify.shop_redact");
        await db.from("commerce_attributions").delete().eq("project_id", store.project_id).eq("kind", "discount");
        await db.from("shopify_stores").delete().eq("id", store.id);
      }
      break;
    }
    case "customers/redact": {
      // No guardamos datos personales de clientes. Por prudencia, borramos los pedidos indicados (ids de pedido, sin cliente).
      const ids = Array.isArray(payload.orders_to_redact) ? (payload.orders_to_redact as unknown[]).map(Number).filter(Number.isSafeInteger) : [];
      if (store && ids.length) await db.from("shopify_orders").delete().eq("store_id", store.id).in("shopify_order_id", ids.slice(0, 1000));
      if (store) await log("shopify.customers_redact", { orders: ids.length });
      break;
    }
    case "customers/data_request": {
      // Kreo no almacena datos personales del cliente (ni nombre, email, teléfono ni dirección): no hay nada que entregar.
      // Se registra la solicitud (sin datos del cliente) para poder responder al comerciante si lo pide.
      if (store) await log("shopify.customers_data_request");
      break;
    }
    case "orders/create":
    case "orders/updated": {
      if (store && store.status === "active") {
        const order = minimizeWebhookOrder(payload);
        if (order) await upsertOrders(store, [order]).catch(() => null);
      }
      break;
    }
    default:
      break;
  }
  return NextResponse.json({ ok: true });
}
