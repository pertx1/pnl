import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getPack } from "@/lib/billing/packs";
import { getStripe, isStripeConfigured } from "@/lib/billing/stripe";
import { netInvoiceAmount, periodEndFromSubscription, planIdFromPrice, subscriptionIdFromInvoice } from "@/lib/billing/stripe-mapping";
import { applySubscriptionSnapshot, handlePaidInvoice, handleRefundedInvoice, workspaceForSubscription } from "@/lib/billing/subscriptions";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/**
 * Webhook de Stripe: verifica la firma y procesa
 *  - compras de créditos (Checkout mode=payment): abono idempotente `stripe:<session_id>`;
 *  - suscripciones (Checkout mode=subscription + customer.subscription.*): plan del workspace;
 *  - facturas pagadas (invoice.paid): créditos mensuales del plan (`plan_invoice:<invoice_id>`) + comisión de afiliado;
 *  - reembolsos/contracargos (charge.refunded, charge.dispute.created): anulan la comisión pendiente.
 * Todo es idempotente: Stripe puede reenviar y desordenar eventos, así que el estado de la suscripción
 * se vuelve a leer SIEMPRE de la API de Stripe. Si algo falla devolvemos 500 y Stripe reintenta.
 */
export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  if (!isStripeConfigured() || !admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") {
          if (typeof session.subscription === "string") await syncSubscription(admin, session.subscription, session.metadata?.user_id ?? null);
          break;
        }
        await handleCreditPurchase(admin, session);
        break;
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment") {
          await admin.from("credit_purchases").update({ status: "failed" }).eq("stripe_checkout_session_id", session.id).eq("status", "pending");
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(admin, sub.id, null);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = subscriptionIdFromInvoice(invoice as never);
        if (!subscriptionId || !invoice.id) break;
        // Puede llegar antes que checkout.session.completed: sincronizamos primero.
        const synced = await syncSubscription(admin, subscriptionId, null);
        const target = synced ?? (await workspaceForSubscription(admin, subscriptionId));
        if (!target) break;
        await handlePaidInvoice(admin, {
          workspaceId: target.workspaceId,
          planId: target.planId,
          invoiceId: invoice.id,
          netCents: netInvoiceAmount(invoice),
          currency: invoice.currency ?? "eur",
        });
        break;
      }
      case "charge.refunded":
      case "charge.dispute.created": {
        const obj = event.data.object as Stripe.Charge | Stripe.Dispute;
        const pi = event.type === "charge.refunded" ? (obj as Stripe.Charge).payment_intent : (obj as Stripe.Dispute).payment_intent;
        const piId = typeof pi === "string" ? pi : pi?.id;
        if (event.type === "charge.refunded" && !(obj as Stripe.Charge).refunded) break; // solo reembolsos totales
        if (!piId) break;
        const payments = await getStripe().invoicePayments.list({ payment: { type: "payment_intent", payment_intent: piId }, limit: 5 });
        for (const p of payments.data) {
          const invoiceId = typeof p.invoice === "string" ? p.invoice : p.invoice?.id;
          if (invoiceId) await handleRefundedInvoice(admin, invoiceId);
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[stripe:webhook] ${event.type} falló: ${err instanceof Error ? err.message : "error"}`);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/** Compra de un pack de créditos (pago único). */
async function handleCreditPurchase(admin: Admin, session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;
  const pack = getPack(session.metadata?.pack_id ?? "");
  const workspaceId = session.metadata?.workspace_id;
  if (!pack || !workspaceId) return;

  const { error } = await admin.rpc("grant_credits", {
    p_workspace_id: workspaceId,
    p_amount: pack.credits,
    p_reason: "purchase",
    p_idempotency_key: `stripe:${session.id}`,
    p_ref_type: "stripe_checkout_session",
    p_ref_id: session.id,
  });
  if (error) throw new Error("grant_failed");

  let invoiceUrl: string | null = null;
  if (typeof session.invoice === "string") {
    const invoice = await getStripe().invoices.retrieve(session.invoice).catch(() => null);
    invoiceUrl = invoice?.hosted_invoice_url ?? null;
  }
  await admin
    .from("credit_purchases")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      amount_total: session.amount_total ?? pack.priceCents,
      currency: session.currency ?? "eur",
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      invoice_url: invoiceUrl,
    })
    .eq("stripe_checkout_session_id", session.id);
}

/**
 * Lee la suscripción de Stripe (fuente de verdad) y la aplica al workspace.
 * Devuelve el workspace y el plan, o null si la suscripción no es de Kreo / no se reconoce el plan.
 */
async function syncSubscription(admin: Admin, subscriptionId: string, subscribedBy: string | null) {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId, { expand: ["items.data.price.product"] });
  const workspaceId = sub.metadata?.workspace_id ?? (await workspaceForSubscription(admin, sub.id))?.workspaceId;
  if (!workspaceId) return null;
  const price = sub.items.data[0]?.price;
  const planId = planIdFromPrice(price, sub.metadata?.plan_id);
  if (!planId) {
    console.error("[stripe:webhook] Precio sin plan reconocido (revisa STRIPE_PRICE_* o lookup_key)");
    return null;
  }
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = subscribedBy ?? sub.metadata?.user_id ?? null;
  await applySubscriptionSnapshot(admin, {
    provider: "stripe",
    workspaceId,
    customerId,
    subscriptionId: sub.id,
    planId,
    status: sub.status,
    currentPeriodEnd: periodEndFromSubscription(sub as never),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at),
    subscribedBy: userId && /^[0-9a-f-]{36}$/i.test(userId) ? userId : null,
  });
  return { workspaceId, planId };
}
