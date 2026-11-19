/**
 * Planes de suscripción de Kreo.
 *
 * ⚠️ PRECIOS Y LÍMITES PROVISIONALES (pendientes de decisión de Oier). Cámbialos aquí.
 * Los límites que se APLICAN de verdad están en la tabla `public.plans` (migración 20261120130000_team.sql):
 * si cambias un límite aquí, cámbialo también allí con una migración nueva para que coincidan.
 *
 * Precios en céntimos de euro al mes, IVA INCLUIDO (Stripe Tax calcula el desglose).
 * Precio de Stripe: si existe la variable de entorno `priceEnv` (ID `price_...` creado en el panel), se usa;
 * si no, Checkout crea el precio al vuelo con `lookupKey` como referencia. Para cambiar de plan desde el portal
 * de cliente de Stripe hacen falta precios creados en el panel (ver docs/compliance/team.md).
 */
export type PlanId = "free" | "pro" | "agency";

export type PlanLimits = {
  projects: number;
  socialAccounts: number;
  members: number;
  monthlyCredits: number;
};

export type PlanDef = {
  id: PlanId;
  name: string;
  /** Precio mensual en céntimos, IVA incluido. 0 = gratis. */
  priceCents: number;
  limits: PlanLimits;
  /** Clave estable del precio en Stripe (lookup_key) y variable de entorno opcional con el ID del precio. */
  lookupKey?: string;
  priceEnv?: string;
  highlight?: boolean;
};

export const PRICES_ARE_PROVISIONAL = true;

export const PLANS: PlanDef[] = [
  { id: "free", name: "Free", priceCents: 0, limits: { projects: 2, socialAccounts: 3, members: 1, monthlyCredits: 50 } },
  {
    id: "pro",
    name: "Pro",
    priceCents: 1900,
    limits: { projects: 10, socialAccounts: 15, members: 3, monthlyCredits: 1000 },
    lookupKey: "kreo_pro_monthly",
    priceEnv: "STRIPE_PRICE_PRO",
    highlight: true,
  },
  {
    id: "agency",
    name: "Agencia",
    priceCents: 7900,
    limits: { projects: 50, socialAccounts: 75, members: 15, monthlyCredits: 5000 },
    lookupKey: "kreo_agency_monthly",
    priceEnv: "STRIPE_PRICE_AGENCY",
  },
];

export const PAID_PLANS = PLANS.filter((p) => p.priceCents > 0);

export function getPlanDef(id: string | null | undefined): PlanDef | null {
  return PLANS.find((p) => p.id === id) ?? null;
}

export function isPaidPlan(id: string | null | undefined): boolean {
  return (getPlanDef(id)?.priceCents ?? 0) > 0;
}

/** Orden de los planes (para saber si un cambio es una mejora). */
export function planRank(id: string): number {
  const i = PLANS.findIndex((p) => p.id === id);
  return i === -1 ? 0 : i;
}
