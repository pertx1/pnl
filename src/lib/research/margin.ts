/** Calculadora de margen por unidad vendida (función pura). */
export type MarginInput = {
  salePrice: number;
  unitCost: number;
  shipping: number;
  /** Comisión de la pasarela/marketplace en % sobre el precio de venta. */
  feePct: number;
  /** Coste por adquisición estimado (publicidad por venta). */
  cpa: number;
};

export type MarginResult = {
  fees: number;
  totalCost: number;
  margin: number;
  marginPct: number | null;
  /** CPA máximo para no perder dinero (break-even). */
  breakEvenCpa: number;
  /** ROAS mínimo para cubrir costes (precio / CPA break-even). */
  breakEvenRoas: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function computeMargin(input: MarginInput): MarginResult {
  const price = safe(input.salePrice);
  const fees = (price * Math.min(100, safe(input.feePct))) / 100;
  const before = price - safe(input.unitCost) - safe(input.shipping) - fees;
  const totalCost = safe(input.unitCost) + safe(input.shipping) + fees + safe(input.cpa);
  const margin = price - totalCost;
  return {
    fees: round2(fees),
    totalCost: round2(totalCost),
    margin: round2(margin),
    marginPct: price > 0 ? round2((margin / price) * 100) : null,
    breakEvenCpa: round2(Math.max(0, before)),
    breakEvenRoas: before > 0 ? round2(price / before) : null,
  };
}
