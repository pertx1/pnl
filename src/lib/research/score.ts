/**
 * Puntuación "producto ganador" 0–100, explicable (función pura).
 * Se basa SOLO en datos públicos de transparencia de la Meta Ad Library:
 *  - Días activo (40): un anuncio que lleva semanas activo suele ser rentable para quien lo paga.
 *  - Variantes (25): nº de anuncios de la misma página sobre el mismo producto en los resultados (están escalando/testeando).
 *  - Plataformas (15): Facebook, Instagram, Messenger, Audience Network…
 *  - Países (10): nº de ubicaciones objetivo (solo disponible para anuncios de UE/UK).
 *  - Alcance UE (10): `eu_total_reach` estimado por Meta (solo UE).
 * No es una promesa de ventas: es una señal para priorizar qué investigar.
 */

export type ScoreInput = {
  startedAt: string | null;
  stoppedAt: string | null;
  variants: number;
  platforms: number;
  countries: number;
  euReach: number | null;
  now?: number;
};

export type ScoreFactor = { key: "days" | "variants" | "platforms" | "countries" | "reach"; points: number; max: number; value: number | null };
export type ScoreResult = { score: number; factors: ScoreFactor[] };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function daysActive(startedAt: string | null, stoppedAt: string | null, now = Date.now()): number | null {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return null;
  const stopParsed = stoppedAt ? Date.parse(stoppedAt) : NaN;
  const end = Number.isFinite(stopParsed) ? Math.min(stopParsed, now) : now;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function winningScore(input: ScoreInput): ScoreResult {
  const days = daysActive(input.startedAt, input.stoppedAt, input.now);
  const factors: ScoreFactor[] = [
    { key: "days", max: 40, value: days, points: days === null ? 0 : 40 * clamp01(days / 60) },
    { key: "variants", max: 25, value: input.variants, points: 25 * clamp01((input.variants - 1) / 9) },
    { key: "platforms", max: 15, value: input.platforms, points: 15 * clamp01(input.platforms / 4) },
    { key: "countries", max: 10, value: input.countries, points: 10 * clamp01(input.countries / 5) },
    {
      key: "reach",
      max: 10,
      value: input.euReach,
      // escala logarítmica: 1.000 → 0, 1.000.000 → 10
      points: input.euReach && input.euReach > 0 ? 10 * clamp01((Math.log10(input.euReach) - 3) / 3) : 0,
    },
  ].map((f) => ({ ...f, points: Math.round(f.points) })) as ScoreFactor[];
  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  return { score, factors };
}

/** Cuenta, para cada anuncio, cuántos anuncios de la MISMA página hay en los resultados (variantes). */
export function countVariantsByPage<T extends { pageId: string }>(ads: T[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of ads) m.set(a.pageId, (m.get(a.pageId) ?? 0) + 1);
  return m;
}
