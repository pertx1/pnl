/**
 * Packs de créditos (pago único). Precios en céntimos de euro, IVA INCLUIDO (Stripe Tax calcula el desglose).
 * Referencia de coste: 1 crédito ≈ 0,01 $ de coste en fal.ai. Cambia aquí los precios cuando quieras.
 */
export type CreditPack = { id: string; credits: number; priceCents: number; highlight?: boolean };

export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack-500", credits: 500, priceCents: 900 },
  { id: "pack-1500", credits: 1500, priceCents: 2400, highlight: true },
  { id: "pack-5000", credits: 5000, priceCents: 6900 },
];

export function getPack(id: string) {
  return CREDIT_PACKS.find((p) => p.id === id) ?? null;
}
