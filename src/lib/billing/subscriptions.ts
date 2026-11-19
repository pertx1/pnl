import "server-only";
import { commissionMonths, commissionRate } from "@/lib/affiliates";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getPlanDef } from "./plans";
import type { ProviderName } from "./provider";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/**
 * Lógica de suscripciones independiente del proveedor. Los webhooks (Stripe hoy, Paddle mañana)
 * normalizan sus eventos y llaman a estas funciones con el cliente admin (service_role).
 */
export type SubscriptionSnapshot = {
  provider: ProviderName;
  workspaceId: string;
  customerId: string;
  subscriptionId: string;
  planId: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  subscribedBy?: string | null;
};

/** Guarda el estado y actualiza workspaces.plan_id (el trigger solo lo permite a service_role). */
export async function applySubscriptionSnapshot(admin: Admin, s: SubscriptionSnapshot) {
  const { data, error } = await admin.rpc("apply_subscription_state", {
    p_workspace_id: s.workspaceId,
    p_provider: s.provider,
    p_customer_id: s.customerId,
    p_subscription_id: s.subscriptionId,
    p_plan_id: s.planId,
    p_status: s.status,
    p_current_period_end: s.currentPeriodEnd,
    p_cancel_at_period_end: s.cancelAtPeriodEnd,
    p_subscribed_by: s.subscribedBy ?? null,
  });
  if (error) throw new Error(`apply_subscription_state: ${error.message}`);
  return data;
}

export type PaidInvoice = {
  workspaceId: string;
  planId: string;
  invoiceId: string;
  netCents: number;
  currency: string;
};

/**
 * Factura de suscripción pagada: abona los créditos mensuales del plan (idempotente por factura)
 * y registra la comisión del afiliado, si la hay (idempotente por factura).
 */
export async function handlePaidInvoice(admin: Admin, inv: PaidInvoice) {
  const plan = getPlanDef(inv.planId);
  if (plan && plan.limits.monthlyCredits > 0) {
    // Los créditos que se abonan son los de la tabla plans (fuente de verdad); plans.ts es el respaldo.
    const { data: row } = await admin.from("plans").select("monthly_credits").eq("id", inv.planId).maybeSingle();
    const credits = row?.monthly_credits ?? plan.limits.monthlyCredits;
    if (credits > 0) {
      const { error } = await admin.rpc("grant_credits", {
        p_workspace_id: inv.workspaceId,
        p_amount: credits,
        p_reason: "monthly_grant",
        p_idempotency_key: `plan_invoice:${inv.invoiceId}`,
        p_ref_type: "invoice",
        p_ref_id: inv.invoiceId,
      });
      if (error) throw new Error(`grant_credits: ${error.message}`);
    }
  }

  if (inv.netCents > 0) {
    const { error } = await admin.rpc("record_commission", {
      p_workspace_id: inv.workspaceId,
      p_invoice_id: inv.invoiceId,
      p_net_cents: inv.netCents,
      p_currency: inv.currency,
      p_rate: commissionRate(),
      p_max_months: commissionMonths(),
    });
    if (error) throw new Error(`record_commission: ${error.message}`);
  }
}

/** Reembolso o contracargo de una factura: anula la comisión pendiente. */
export async function handleRefundedInvoice(admin: Admin, invoiceId: string) {
  await admin.rpc("void_commission", { p_invoice_id: invoiceId });
}

/** Workspace de una suscripción ya conocida (o null). */
export async function workspaceForSubscription(admin: Admin, subscriptionId: string): Promise<{ workspaceId: string; planId: string } | null> {
  const { data } = await admin.from("workspace_subscriptions").select("workspace_id, plan_id").eq("subscription_id", subscriptionId).maybeSingle();
  return data ? { workspaceId: data.workspace_id, planId: data.plan_id } : null;
}
