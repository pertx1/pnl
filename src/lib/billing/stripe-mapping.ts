/**
 * Traducción pura de objetos de Stripe a datos de Kreo (sin red: testeable).
 * Solo usa los campos mínimos para no acoplarse a la versión de la API.
 */
import { PAID_PLANS, type PlanId } from "./plans";

type PriceLike = { id: string; lookup_key?: string | null; product?: unknown } | null | undefined;

/** Plan a partir del precio: ID configurado en env → lookup_key → metadata de la suscripción. */
export function planIdFromPrice(price: PriceLike, metadataPlanId?: string | null, env: Record<string, string | undefined> = process.env): PlanId | null {
  if (price) {
    for (const p of PAID_PLANS) {
      if (p.priceEnv && env[p.priceEnv] && env[p.priceEnv] === price.id) return p.id;
      if (p.lookupKey && price.lookup_key === p.lookupKey) return p.id;
    }
    const product = price.product as { metadata?: Record<string, string> } | null | undefined;
    const fromProduct = product && typeof product === "object" ? product.metadata?.plan_id : undefined;
    if (fromProduct && PAID_PLANS.some((p) => p.id === fromProduct)) return fromProduct as PlanId;
  }
  if (metadataPlanId && PAID_PLANS.some((p) => p.id === metadataPlanId)) return metadataPlanId as PlanId;
  return null;
}

/** Estados en los que el plan de pago está en vigor. */
export const ACTIVE_STATUSES = ["active", "trialing", "past_due"] as const;
export function isActiveStatus(status: string | null | undefined) {
  return (ACTIVE_STATUSES as readonly string[]).includes(status ?? "");
}

/** Fin del periodo actual (en las versiones nuevas de la API vive en cada item). */
export function periodEndFromSubscription(sub: { items?: { data?: { current_period_end?: number | null }[] }; current_period_end?: number | null }): string | null {
  const fromItems = (sub.items?.data ?? []).map((i) => i.current_period_end ?? 0).filter((n) => n > 0);
  const ts = fromItems.length ? Math.max(...fromItems) : (sub.current_period_end ?? 0);
  return ts > 0 ? new Date(ts * 1000).toISOString() : null;
}

/** Importe neto (sin impuestos) de una factura pagada, en céntimos. Base de la comisión de afiliados. */
export function netInvoiceAmount(invoice: { total_excluding_tax?: number | null; amount_paid?: number | null; total?: number | null }): number {
  const net = invoice.total_excluding_tax ?? invoice.total ?? invoice.amount_paid ?? 0;
  return Math.max(0, Math.min(net, invoice.amount_paid ?? net));
}

/** ID de la suscripción de una factura (API nueva: parent.subscription_details; antigua: invoice.subscription). */
export function subscriptionIdFromInvoice(invoice: {
  parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  subscription?: string | { id: string } | null;
}): string | null {
  const s = invoice.parent?.subscription_details?.subscription ?? invoice.subscription ?? null;
  if (!s) return null;
  return typeof s === "string" ? s : s.id;
}
