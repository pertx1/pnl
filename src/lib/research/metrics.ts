/**
 * Métricas de competencia (funciones puras, sin dependencias de servidor → testeables).
 *
 * - Outlier: publicación cuyo rendimiento es ≥ 3× la mediana de las últimas ~30 publicaciones del canal.
 * - Frecuencia: publicaciones por semana en las últimas 8 semanas.
 *
 * OJO YouTube: sus Developer Policies (III.E.4.h) prohíben crear métricas derivadas de la API salvo desarrolladores
 * auditados para analítica (III.L). Estas funciones solo se aplican a YouTube si `YOUTUBE_DERIVED_METRICS_APPROVED=true`.
 */

export const OUTLIER_THRESHOLD = 3;
export const OUTLIER_WINDOW = 30;
export const FREQUENCY_WEEKS = 8;

export type MetricPost = { id: string; publishedAt: string | null; value: number | null };

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Las N publicaciones más recientes con valor conocido. */
export function recentWindow<T extends MetricPost>(posts: T[], window = OUTLIER_WINDOW): T[] {
  return posts
    .filter((p) => p.value !== null && p.publishedAt)
    .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))
    .slice(0, window);
}

export type Outlier<T> = { post: T; multiple: number };

/**
 * Outliers dentro de la ventana reciente. Necesita al menos 5 publicaciones y una mediana > 0
 * (con menos datos el múltiplo no significa nada). Ordenados por múltiplo descendente.
 */
export function findOutliers<T extends MetricPost>(posts: T[], threshold = OUTLIER_THRESHOLD, window = OUTLIER_WINDOW): { median: number | null; outliers: Outlier<T>[] } {
  const recent = recentWindow(posts, window);
  const med = median(recent.map((p) => p.value as number));
  if (recent.length < 5 || !med || med <= 0) return { median: med, outliers: [] };
  const outliers = recent
    .map((post) => ({ post, multiple: Math.round(((post.value as number) / med) * 10) / 10 }))
    .filter((o) => o.multiple >= threshold)
    .sort((a, b) => b.multiple - a.multiple);
  return { median: med, outliers };
}

/** Publicaciones por semana (de la más antigua a la actual). `now` inyectable para tests. */
export function postsPerWeek(dates: (string | null)[], weeks = FREQUENCY_WEEKS, now = Date.now()): { weekStart: string; count: number }[] {
  const WEEK = 7 * 86_400_000;
  const buckets = Array.from({ length: weeks }, (_, i) => ({ weekStart: new Date(now - (weeks - i) * WEEK).toISOString().slice(0, 10), count: 0 }));
  for (const d of dates) {
    if (!d) continue;
    const age = now - Date.parse(d);
    if (!Number.isFinite(age) || age < 0 || age >= weeks * WEEK) continue;
    const idx = weeks - 1 - Math.floor(age / WEEK);
    buckets[idx].count++;
  }
  return buckets;
}

export function averagePerWeek(buckets: { count: number }[]): number {
  if (!buckets.length) return 0;
  return Math.round((buckets.reduce((s, b) => s + b.count, 0) / buckets.length) * 10) / 10;
}

/** Valor que se compara para detectar outliers: views si las hay (YouTube); si no, interacciones (Instagram). */
export function performanceValue(p: { views: number | null; likes: number | null; comments: number | null }): number | null {
  if (p.views !== null && p.views !== undefined) return p.views;
  if (p.likes === null && p.comments === null) return null;
  return (p.likes ?? 0) + (p.comments ?? 0);
}
