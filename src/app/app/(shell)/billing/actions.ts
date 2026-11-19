"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { applyConsentedReferral } from "@/lib/affiliates/server";
import { getPack } from "@/lib/billing/packs";
import { getPlanDef } from "@/lib/billing/plans";
import { getBillingProvider } from "@/lib/billing/provider";
import { isActiveStatus } from "@/lib/billing/stripe-mapping";
import { getStripe, isStripeConfigured } from "@/lib/billing/stripe";
import { appUrl } from "@/lib/env";
import { getCurrentWorkspace } from "@/lib/server/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Compra de un pack de créditos con Stripe Checkout (página de pago alojada por Stripe: tarjeta, Apple Pay, Google Pay).
 * Solo admins/owners del workspace. Los créditos se abonan en el webhook al confirmarse el pago, nunca aquí.
 */
export async function buyCredits(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string } | undefined> {
  const parsed = z.object({ packId: z.string().max(40), waiver: z.literal("on") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "waiver_required" };
  const pack = getPack(parsed.data.packId);
  const admin = createAdminClient();
  if (!pack || !isStripeConfigured() || !admin) return { error: "not_configured" };

  const workspace = await getCurrentWorkspace();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("has_workspace_role", { p_workspace_id: workspace.id, p_min_role: "admin" });
  if (!isAdmin) return { error: "forbidden" };

  const locale = await getLocale();
  const base = appUrl();
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    locale: locale === "en" ? "en" : "es",
    customer_email: auth.user.email,
    customer_creation: "always",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: pack.priceCents,
          tax_behavior: "inclusive",
          product_data: { name: `Kreo · ${pack.credits} créditos`, description: "Créditos para generar contenido con IA en Kreo" },
        },
      },
    ],
    // IVA europeo con Stripe Tax (activar en el panel de Stripe: Settings → Tax).
    automatic_tax: { enabled: process.env.STRIPE_TAX_ENABLED === "true" },
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    invoice_creation: { enabled: true },
    success_url: `${base}/app/billing?status=success`,
    cancel_url: `${base}/app/billing?status=cancelled`,
    metadata: { workspace_id: workspace.id, pack_id: pack.id, user_id: auth.user.id, withdrawal_waiver: new Date().toISOString() },
  });

  await admin.from("credit_purchases").insert({
    workspace_id: workspace.id,
    purchased_by: auth.user.id,
    pack_id: pack.id,
    credits: pack.credits,
    amount_total: pack.priceCents,
    currency: "eur",
    stripe_checkout_session_id: session.id,
  });

  if (!session.url) return { error: "generic" };
  redirect(session.url);
}

// ---------------------------------------------------------------- suscripciones

type PlanActionState = { error?: "not_configured" | "forbidden" | "invalid_plan" | "terms_required" | "already_subscribed" | "no_customer" | "generic" } | undefined;

/** Contratar un plan con el proveedor de pagos (Stripe Checkout, mode subscription). Solo admins/owners. */
export async function startSubscription(_prev: PlanActionState, formData: FormData): Promise<PlanActionState> {
  const parsed = z.object({ planId: z.enum(["pro", "agency"]), terms: z.literal("on") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: formData.get("terms") ? "invalid_plan" : "terms_required" };
  const plan = getPlanDef(parsed.data.planId);
  const provider = await getBillingProvider();
  const admin = createAdminClient();
  if (!plan || !provider || !admin) return { error: "not_configured" };

  const workspace = await getCurrentWorkspace();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("has_workspace_role", { p_workspace_id: workspace.id, p_min_role: "admin" });
  if (!isAdmin) return { error: "forbidden" };

  const { data: current } = await supabase.from("workspace_subscriptions").select("customer_id, status, subscription_id").eq("workspace_id", workspace.id).maybeSingle();
  // Ya hay una suscripción en vigor: los cambios de plan se hacen en el portal (prorrateo correcto, sin duplicar cobros).
  if (current?.subscription_id && isActiveStatus(current.status)) return { error: "already_subscribed" };

  // Atribución de afiliado con la cookie consentida (si la hay). Nunca bloquea.
  await applyConsentedReferral();

  const locale = (await getLocale()) === "en" ? "en" : "es";
  const base = appUrl();
  let url: string;
  try {
    const result = await provider.createSubscriptionCheckout({
      plan,
      workspaceId: workspace.id,
      userId: auth.user.id,
      email: auth.user.email,
      customerId: current?.customer_id ?? null,
      locale,
      successUrl: `${base}/app/billing?status=subscribed`,
      cancelUrl: `${base}/app/billing?status=cancelled`,
    });
    url = result.url;
  } catch {
    return { error: "generic" };
  }
  redirect(url);
}

/** Abrir el portal de cliente del proveedor (cambiar de plan, método de pago, facturas, cancelar). */
export async function openBillingPortal(): Promise<PlanActionState> {
  const provider = await getBillingProvider();
  if (!provider) return { error: "not_configured" };
  const workspace = await getCurrentWorkspace();
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("has_workspace_role", { p_workspace_id: workspace.id, p_min_role: "admin" });
  if (!isAdmin) return { error: "forbidden" };
  const { data: sub } = await supabase.from("workspace_subscriptions").select("customer_id").eq("workspace_id", workspace.id).maybeSingle();
  if (!sub?.customer_id) return { error: "no_customer" };

  let url: string;
  try {
    const locale = (await getLocale()) === "en" ? "en" : "es";
    url = (await provider.createPortalSession({ customerId: sub.customer_id, returnUrl: `${appUrl()}/app/billing`, locale })).url;
  } catch {
    return { error: "generic" };
  }
  redirect(url);
}
