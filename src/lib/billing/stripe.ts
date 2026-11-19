import "server-only";
import Stripe from "stripe";

/** Cliente de Stripe (solo servidor). Clave: STRIPE_SECRET_KEY. */
let stripe: Stripe | null = null;
export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}
export function getStripe() {
  if (!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return stripe;
}
