import "server-only";
import type { PlanDef } from "./plans";

/**
 * Interfaz pequeña del proveedor de pagos de suscripciones. Hoy: Stripe (./stripe-provider.ts).
 * Si se cambia a Paddle (Merchant of Record), basta con otra implementación de esta interfaz + su webhook
 * en src/app/api/paddle/webhook que llame a las mismas funciones de ./subscriptions.ts.
 */
export type ProviderName = "stripe" | "paddle";

export type SubscriptionCheckoutInput = {
  plan: PlanDef;
  workspaceId: string;
  userId: string;
  email: string;
  /** Cliente ya existente del proveedor (para no duplicar clientes). */
  customerId?: string | null;
  locale: "es" | "en";
  successUrl: string;
  cancelUrl: string;
  /** Código de afiliado atribuido (solo informativo, la atribución real está en la base de datos). */
  referralCode?: string | null;
};

export interface BillingProvider {
  readonly name: ProviderName;
  isConfigured(): boolean;
  createSubscriptionCheckout(input: SubscriptionCheckoutInput): Promise<{ url: string; customerId: string | null }>;
  createPortalSession(input: { customerId: string; returnUrl: string; locale: "es" | "en" }): Promise<{ url: string }>;
}

/** Proveedor activo (por ahora siempre Stripe). Devuelve null si no está configurado. */
export async function getBillingProvider(): Promise<BillingProvider | null> {
  const { stripeProvider } = await import("./stripe-provider");
  return stripeProvider.isConfigured() ? stripeProvider : null;
}
