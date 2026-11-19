import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getPack } from "@/lib/billing/packs";
import { getStripe, isStripeConfigured } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook de Stripe: verifica la firma y abona los créditos al confirmarse el pago.
 * Idempotente: el abono usa la clave `stripe:<session_id>` (Stripe puede reenviar el mismo evento).
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

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") return NextResponse.json({ received: true });
    const pack = getPack(session.metadata?.pack_id ?? "");
    const workspaceId = session.metadata?.workspace_id;
    if (!pack || !workspaceId) return NextResponse.json({ received: true });

    const { error } = await admin.rpc("grant_credits", {
      p_workspace_id: workspaceId,
      p_amount: pack.credits,
      p_reason: "purchase",
      p_idempotency_key: `stripe:${session.id}`,
      p_ref_type: "stripe_checkout_session",
      p_ref_id: session.id,
    });
    if (error) return NextResponse.json({ error: "grant_failed" }, { status: 500 }); // Stripe reintentará

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

  if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    await admin.from("credit_purchases").update({ status: "failed" }).eq("stripe_checkout_session_id", session.id).eq("status", "pending");
  }

  return NextResponse.json({ received: true });
}
