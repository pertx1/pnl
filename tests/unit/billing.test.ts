import { describe, expect, it } from "vitest";
import { canAdd, evaluateLimit, limitKindFromError } from "@/lib/billing/limits";
import { getPlanDef, isPaidPlan, PAID_PLANS, PLANS, planRank } from "@/lib/billing/plans";
import { isActiveStatus, netInvoiceAmount, periodEndFromSubscription, planIdFromPrice, subscriptionIdFromInvoice } from "@/lib/billing/stripe-mapping";

describe("planes", () => {
  it("Free, Pro y Agencia, de menor a mayor", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["free", "pro", "agency"]);
    expect(planRank("agency")).toBeGreaterThan(planRank("pro"));
    for (let i = 1; i < PLANS.length; i++) {
      const [a, b] = [PLANS[i - 1], PLANS[i]];
      expect(b.priceCents).toBeGreaterThan(a.priceCents);
      expect(b.limits.members).toBeGreaterThanOrEqual(a.limits.members);
      expect(b.limits.monthlyCredits).toBeGreaterThan(a.limits.monthlyCredits);
    }
  });

  it("límites del plan gratuito = los de la migración core (free: 2/3/1/50)", () => {
    expect(getPlanDef("free")?.limits).toEqual({ projects: 2, socialAccounts: 3, members: 1, monthlyCredits: 50 });
  });

  it("los planes de pago tienen lookup_key y variable de precio", () => {
    for (const p of PAID_PLANS) {
      expect(p.lookupKey).toBeTruthy();
      expect(p.priceEnv).toMatch(/^STRIPE_PRICE_/);
    }
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan("pro")).toBe(true);
    expect(getPlanDef("nope")).toBeNull();
  });
});

describe("límites", () => {
  it("evalúa uso", () => {
    expect(evaluateLimit("projects", 1, 2)).toMatchObject({ remaining: 1, reached: false, near: false });
    expect(evaluateLimit("projects", 2, 2)).toMatchObject({ remaining: 0, reached: true, near: false });
    expect(evaluateLimit("members", 4, 5)).toMatchObject({ near: true, reached: false });
    expect(evaluateLimit("members", 7, 5)).toMatchObject({ reached: true, remaining: 0 });
    expect(evaluateLimit("members", 0, 0)).toMatchObject({ reached: true, ratio: 1 });
  });

  it("canAdd", () => {
    expect(canAdd({ used: 1, max: 3 }, 2)).toBe(true);
    expect(canAdd({ used: 2, max: 3 }, 2)).toBe(false);
  });

  it("errores de límite de la base de datos", () => {
    expect(limitKindFromError("plan_limit_projects")).toBe("projects");
    expect(limitKindFromError("ERROR: plan_limit_members")).toBe("members");
    expect(limitKindFromError("plan_limit_accounts")).toBe("socialAccounts");
    expect(limitKindFromError("otra cosa")).toBeNull();
  });
});

describe("mapeo de Stripe", () => {
  it("plan por ID de precio en env, lookup_key, producto o metadata", () => {
    expect(planIdFromPrice({ id: "price_1" }, null, { STRIPE_PRICE_PRO: "price_1" })).toBe("pro");
    expect(planIdFromPrice({ id: "x", lookup_key: "kreo_agency_monthly" }, null, {})).toBe("agency");
    expect(planIdFromPrice({ id: "x", product: { metadata: { plan_id: "pro" } } }, null, {})).toBe("pro");
    expect(planIdFromPrice({ id: "x" }, "agency", {})).toBe("agency");
    expect(planIdFromPrice({ id: "x" }, "free", {})).toBeNull();
    expect(planIdFromPrice(null, "hack", {})).toBeNull();
  });

  it("estados activos", () => {
    expect(isActiveStatus("active")).toBe(true);
    expect(isActiveStatus("past_due")).toBe(true);
    expect(isActiveStatus("canceled")).toBe(false);
    expect(isActiveStatus(undefined)).toBe(false);
  });

  it("fin de periodo desde los items (API nueva) o la suscripción (antigua)", () => {
    expect(periodEndFromSubscription({ items: { data: [{ current_period_end: 1700000000 }, { current_period_end: 1700000100 }] } })).toBe(
      new Date(1700000100 * 1000).toISOString(),
    );
    expect(periodEndFromSubscription({ current_period_end: 1700000000 })).toBe(new Date(1700000000 * 1000).toISOString());
    expect(periodEndFromSubscription({})).toBeNull();
  });

  it("importe neto sin IVA y nunca mayor que lo pagado", () => {
    expect(netInvoiceAmount({ total_excluding_tax: 1570, amount_paid: 1900 })).toBe(1570);
    expect(netInvoiceAmount({ total_excluding_tax: 1570, amount_paid: 0 })).toBe(0);
    expect(netInvoiceAmount({ amount_paid: 1900 })).toBe(1900);
    expect(netInvoiceAmount({ total_excluding_tax: -100, amount_paid: 0 })).toBe(0);
  });

  it("suscripción de una factura", () => {
    expect(subscriptionIdFromInvoice({ parent: { subscription_details: { subscription: "sub_1" } } })).toBe("sub_1");
    expect(subscriptionIdFromInvoice({ subscription: { id: "sub_2" } })).toBe("sub_2");
    expect(subscriptionIdFromInvoice({})).toBeNull();
  });
});
