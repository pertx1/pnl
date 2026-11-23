/**
 * «Mejores horas para publicar». Lógica pura (sin BD): tests en tests/unit/best-time.test.ts.
 *
 * Combina dos fuentes, con honestidad sobre cuál pesa más:
 *  a) Un PATRÓN POR DEFECTO por red, ORIENTATIVO. Es una aproximación suavizada (no cifras copiadas) de las franjas en
 *     las que coinciden estos estudios públicos del sector, hechos sobre todo con audiencias de EE. UU./globales:
 *       - Sprout Social, «Best times to post on social media» (edición 2025):
 *         https://sproutsocial.com/insights/best-times-to-post-on-social-media/
 *       - Hootsuite, «Best time to post on Instagram / TikTok / YouTube» (2025):
 *         https://blog.hootsuite.com/best-time-to-post-on-instagram/
 *         https://blog.hootsuite.com/best-time-to-post-on-tiktok/
 *         https://blog.hootsuite.com/best-time-to-post-on-youtube/
 *       - Buffer, «The best time to post on Instagram» (análisis de millones de publicaciones):
 *         https://buffer.com/resources/when-is-the-best-time-to-post-on-instagram/
 *     Coinciden a grandes rasgos en: Instagram entre semana a media mañana y a última hora de la tarde; TikTok por la
 *     tarde-noche; YouTube a primera hora de la tarde (para estar indexado antes del pico de la noche) y mejor jueves a
 *     domingo. Varía mucho por país y audiencia: por eso es solo un punto de partida.
 *  b) El HISTORIAL PROPIO del usuario: publicaciones hechas con Kreo (post_targets.published_at) con una puntuación de
 *     rendimiento (p. ej. visualizaciones por publicación, si hay métricas por publicación). Solo se usa a partir de
 *     `minSamples` publicaciones con puntuación y su peso crece con el número de muestras.
 *     Si la puntuación es una aproximación (p. ej. crecimiento diario de la cuenta), se marca `proxy` y pesa la mitad.
 *
 * YouTube: sus Developer Policies (III.E.4) prohíben crear métricas derivadas combinando datos de la API de YouTube
 * con otras fuentes. Para YouTube se devuelve SIEMPRE solo el patrón orientativo (el historial se ignora).
 *
 * Días: 0 = lunes … 6 = domingo. Horas locales de `timezone` (por defecto Europe/Madrid).
 */
import { DEFAULT_TZ, zonedParts } from "@/lib/mcp/calendar";

export type BestTimePlatform = "tiktok" | "instagram" | "youtube";
export type HistoryPoint = { publishedAt: string; score?: number | null; proxy?: boolean };
export type BestSlot = { weekday: number; hour: number; score: number };
export type BestTimesSource = "default" | "blended" | "history";
export type BestTimesResult = {
  platform: BestTimePlatform;
  timezone: string;
  source: BestTimesSource;
  /** Publicaciones con puntuación usadas (0 en YouTube). */
  samples: number;
  minSamples: number;
  /** Peso del historial propio en la mezcla (0–1). */
  historyWeight: number;
  /** Mejores franjas, de mejor a peor (sin dos horas contiguas del mismo día). */
  top: BestSlot[];
  /** Puntuación 0–100 por [día][hora]. */
  grid: number[][];
  notes: ("orientative" | "youtube_policy" | "not_enough_history")[];
};

export const MIN_SAMPLES = 12;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Pesos 0–1 por hora local (0–23) y por día (lunes–domingo). Ver fuentes arriba.
const DEFAULT_PATTERN: Record<BestTimePlatform, { hours: number[]; days: number[] }> = {
  instagram: {
    hours: [0.1, 0.05, 0.05, 0.05, 0.05, 0.1, 0.25, 0.45, 0.6, 0.7, 0.8, 0.9, 0.9, 0.8, 0.7, 0.65, 0.7, 0.8, 0.9, 0.95, 0.85, 0.65, 0.4, 0.2],
    days: [0.85, 0.95, 1, 0.95, 0.85, 0.7, 0.65],
  },
  tiktok: {
    hours: [0.2, 0.1, 0.05, 0.05, 0.05, 0.05, 0.15, 0.3, 0.4, 0.5, 0.55, 0.6, 0.7, 0.7, 0.65, 0.7, 0.75, 0.85, 0.95, 1, 0.95, 0.85, 0.6, 0.35],
    days: [0.8, 0.9, 0.95, 1, 0.95, 0.85, 0.8],
  },
  youtube: {
    hours: [0.1, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1, 0.95, 0.85, 0.7, 0.55, 0.4, 0.25, 0.15],
    days: [0.75, 0.8, 0.85, 0.95, 1, 0.95, 0.85],
  },
};

export function isBestTimePlatform(p: string): p is BestTimePlatform {
  return p === "tiktok" || p === "instagram" || p === "youtube";
}

/** Día (0 = lunes) y hora local de un instante. */
export function localSlot(date: Date, tz: string) {
  const z = zonedParts(date, tz);
  return { weekday: Math.max(0, WEEKDAYS.indexOf(z.weekday)), hour: Math.floor(z.minutes / 60) };
}

function defaultGrid(platform: BestTimePlatform) {
  const p = DEFAULT_PATTERN[platform];
  return p.days.map((d) => p.hours.map((h) => d * h));
}

function normalize(grid: number[][]) {
  const max = Math.max(...grid.flat(), 1e-9);
  return grid.map((row) => row.map((v) => v / max));
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function bestTimes(
  platform: BestTimePlatform,
  history: HistoryPoint[],
  opts: { timezone?: string; minSamples?: number; top?: number } = {},
): BestTimesResult {
  const tz = opts.timezone ?? DEFAULT_TZ;
  const minSamples = opts.minSamples ?? MIN_SAMPLES;
  const def = normalize(defaultGrid(platform));
  const notes: BestTimesResult["notes"] = ["orientative"];

  const scored =
    platform === "youtube"
      ? []
      : history.filter((h) => typeof h.score === "number" && Number.isFinite(h.score) && h.score >= 0 && !Number.isNaN(new Date(h.publishedAt).getTime()));
  if (platform === "youtube") notes.push("youtube_policy");

  let grid = def;
  let weight = 0;
  if (scored.length >= minSamples) {
    const scores = scored.map((h) => h.score as number);
    const base = median(scores) || scores.reduce((a, b) => a + b, 0) / scores.length;
    if (base > 0) {
      // Rendimiento relativo (1 = publicación típica), con suavizado a horas vecinas y al mismo tramo de otros días.
      const sum = def.map((r) => r.map(() => 0));
      const w = def.map((r) => r.map(() => 0));
      for (const h of scored) {
        const { weekday, hour } = localSlot(new Date(h.publishedAt), tz);
        const ratio = Math.min((h.score as number) / base, 10); // un viral no se come todo el patrón
        const k0 = h.proxy ? 0.5 : 1;
        for (let d = 0; d < 7; d++) {
          for (let dh = -2; dh <= 2; dh++) {
            const hh = (hour + dh + 24) % 24;
            const k = k0 * (d === weekday ? [0.2, 0.5, 1, 0.5, 0.2][dh + 2] : dh === 0 ? 0.15 : 0);
            if (!k) continue;
            sum[d][hh] += k * ratio;
            w[d][hh] += k;
          }
        }
      }
      // Sin datos cerca, cada celda vuelve al patrón por defecto (en escala relativa, media ≈ 1).
      const defMean = def.flat().reduce((a, b) => a + b, 0) / (7 * 24);
      const K = 2;
      const hist = normalize(def.map((r, d) => r.map((v, h) => (sum[d][h] + K * (v / defMean)) / (w[d][h] + K))));
      weight = Math.min(0.85, scored.length / (scored.length + 20));
      grid = def.map((r, d) => r.map((v, h) => (1 - weight) * v + weight * hist[d][h]));
      grid = normalize(grid);
    }
  } else if (platform !== "youtube") {
    notes.push("not_enough_history");
  }

  const grid100 = grid.map((r) => r.map((v) => Math.round(v * 100)));
  const cells = grid100.flatMap((r, d) => r.map((score, hour) => ({ weekday: d, hour, score })));
  cells.sort((a, b) => b.score - a.score || a.weekday - b.weekday || a.hour - b.hour);
  const top: BestSlot[] = [];
  for (const c of cells) {
    if (top.length >= (opts.top ?? 5)) break;
    if (top.some((t) => t.weekday === c.weekday && Math.abs(t.hour - c.hour) <= 1)) continue;
    top.push(c);
  }

  return {
    platform,
    timezone: tz,
    source: weight === 0 ? "default" : weight < 0.6 ? "blended" : "history",
    samples: scored.length,
    minSamples,
    historyWeight: Math.round(weight * 100) / 100,
    top,
    grid: grid100,
    notes,
  };
}

/** Puntuación 0–100 de un instante concreto según el resultado. */
export function scoreAt(result: Pick<BestTimesResult, "grid" | "timezone">, date: Date) {
  const { weekday, hour } = localSlot(date, result.timezone);
  return result.grid[weekday]?.[hour] ?? 0;
}

/** Mejores horas (0–23) de un día de la semana, de mejor a peor. */
export function bestHoursForWeekday(result: Pick<BestTimesResult, "grid">, weekday: number, count = 3) {
  return (result.grid[weekday] ?? [])
    .map((score, hour) => ({ hour, score }))
    .sort((a, b) => b.score - a.score || a.hour - b.hour)
    .slice(0, count);
}
