"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { getPack } from "@/lib/billing/packs";
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
