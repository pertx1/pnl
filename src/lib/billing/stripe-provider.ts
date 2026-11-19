import "server-only";
import type Stripe from "stripe";
import type { BillingProvider } from "./provider";
import { getStripe, isStripeConfigured } from "./stripe";

/** Implementación de BillingProvider con Stripe Checkout (mode subscription) y el portal de cliente. */
export const stripeProvider: BillingProvider = {
  name: "stripe",
  isConfigured: isStripeConfigured,

  async createSubscriptionCheckout(input) {
    const { plan } = input;
    const priceId = plan.priceEnv ? process.env[plan.priceEnv] : undefined;
    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: plan.priceCents,
            tax_behavior: "inclusive",
            recurring: { interval: "month" },
            product_data: { name: `Kreo ${plan.name}`, metadata: { plan_id: plan.id } },
          },
        };
    const metadata = { workspace_id: input.workspaceId, plan_id: plan.id, user_id: input.userId, kind: "subscription" };

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      locale: input.locale,
      line_items: [lineItem],
      ...(input.customerId ? { customer: input.customerId, customer_update: { address: "auto", name: "auto" } } : { customer_email: input.email }),
      client_reference_id: input.workspaceId,
      automatic_tax: { enabled: process.env.STRIPE_TAX_ENABLED === "true" },
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      allow_promotion_codes: false,
      subscription_data: { metadata },
      metadata,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    if (!session.url) throw new Error("checkout_without_url");
    return { url: session.url, customerId: typeof session.customer === "string" ? session.customer : null };
  },

  async createPortalSession({ customerId, returnUrl, locale }) {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      locale,
      ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID } : {}),
    });
    return { url: session.url };
  },
};
