/**
 * Cálculos del panel del proyecto. Funciones puras (sin Supabase ni React) para poder probarlas
 * y para que la página no llame a Date.now() al renderizar (lint react-hooks/purity).
 */

const DAY_MS = 86_400_000;

/** Zona horaria por defecto de Kreo (la misma que usan las tareas programadas y el MCP). */
export const DEFAULT_TZ = "Europe/Madrid";

/** Día (YYYY-MM-DD) de un instante en una zona horaria. */
export function dayIn(date: Date, timeZone: string) {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Suma n días a un día YYYY-MM-DD (en calendario, sin zonas horarias). */
export function addDaysToKey(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  return new Date(d.getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** Límites de tiempo del panel, calculados una vez por petición. */
export function dashboardBounds(now: number = Date.now(), timeZone: string = DEFAULT_TZ) {
  return {
    nowIso: new Date(now).toISOString(),
    in7Iso: new Date(now + 7 * DAY_MS).toISOString(),
    since7Iso: new Date(now - 7 * DAY_MS).toISOString(),
    since28Iso: new Date(now - 28 * DAY_MS).toISOString(),
    since30Iso: new Date(now - 30 * DAY_MS).toISOString(),
    /** Las métricas diarias se guardan por día UTC; 31 días para poder comparar con hace 30. */
    metricsSinceDay: new Date(now - 31 * DAY_MS).toISOString().slice(0, 10),
    today: dayIn(new Date(now), timeZone),
  };
}

// ------------------------------------------------------------------------------------- CUENTAS

export type MetricRow = { social_account_id: string; day: string; followers: number | null; views: number | null; likes: number | null };
export type AccountLite = { id: string; platform: string };

export type AccountStats = {
  /** false si aún no hay ninguna fila de estadísticas para la cuenta. */
  hasData: boolean;
  followers: number | null;
  views: number | null;
  likes: number | null;
  /** Variación de seguidores frente al dato de hace 7 / 30 días (undefined si aún no hay tanto histórico). */
  delta7?: number;
  delta30?: number;
  /** Serie de seguidores (orden cronológico) para el sparkline. */
  series: { day: string; value: number }[];
};

/** Último valor no nulo de una métrica. */
function lastValue(rows: MetricRow[], key: "followers" | "views" | "likes") {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][key];
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/**
 * Variación de una serie frente a `days` días antes de su último dato.
 * Compara con el último punto cuyo día es <= (último día − days); si no existe, no hay histórico suficiente.
 */
export function seriesDelta(series: { day: string; value: number }[], days: number): number | undefined {
  if (series.length < 2) return undefined;
  const last = series.at(-1)!;
  const target = addDaysToKey(last.day, -days);
  for (let i = series.length - 2; i >= 0; i--) {
    if (series[i].day <= target) return last.value - series[i].value;
  }
  return undefined;
}

/** Estadísticas por cuenta a partir de las filas diarias (cualquier orden). */
export function statsByAccount(accounts: AccountLite[], metrics: MetricRow[], sparkDays = 30): Map<string, AccountStats> {
  const grouped = new Map<string, MetricRow[]>();
  for (const m of metrics) grouped.set(m.social_account_id, [...(grouped.get(m.social_account_id) ?? []), m]);
  const out = new Map<string, AccountStats>();
  for (const a of accounts) {
    const rows = (grouped.get(a.id) ?? []).slice().sort((x, y) => x.day.localeCompare(y.day));
    const series = rows.filter((r) => r.followers !== null && r.followers !== undefined).map((r) => ({ day: r.day, value: r.followers as number }));
    const lastDay = series.at(-1)?.day;
    const sparkFrom = lastDay ? addDaysToKey(lastDay, -sparkDays) : "";
    out.set(a.id, {
      hasData: rows.length > 0,
      followers: lastValue(rows, "followers"),
      views: lastValue(rows, "views"),
      likes: lastValue(rows, "likes"),
      delta7: seriesDelta(series, 7),
      delta30: seriesDelta(series, 30),
      series: series.filter((p) => p.day >= sparkFrom),
    });
  }
  return out;
}

export type CombinedTotals = {
  /** Cuentas que entran en el total (nunca YouTube). */
  accounts: number;
  followers: number | null;
  views: number | null;
  likes: number | null;
  delta7?: number;
  delta30?: number;
};

/**
 * Total combinado de las cuentas que NO son de YouTube.
 * YouTube queda fuera siempre: sus Developer Policies (III.E.2 y III.E.4.h) prohíben combinar sus datos
 * con los de otras fuentes y crear métricas derivadas. Las variaciones solo se suman si todas las cuentas
 * con datos tienen histórico suficiente (si no, el total engañaría).
 */
export function combinedTotals(accounts: AccountLite[], stats: Map<string, AccountStats>): CombinedTotals {
  const included = accounts.filter((a) => a.platform !== "youtube");
  const withData = included.map((a) => stats.get(a.id)).filter((s): s is AccountStats => !!s && s.hasData);
  const sum = (k: "followers" | "views" | "likes") => {
    const vals = withData.map((s) => s[k]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const sumDelta = (k: "delta7" | "delta30") => {
    const withFollowers = withData.filter((s) => s.followers !== null);
    if (!withFollowers.length || withFollowers.some((s) => s[k] === undefined)) return undefined;
    return withFollowers.reduce((a, s) => a + (s[k] as number), 0);
  };
  return { accounts: included.length, followers: sum("followers"), views: sum("views"), likes: sum("likes"), delta7: sumDelta("delta7"), delta30: sumDelta("delta30") };
}

// ------------------------------------------------------------------------------------- PUBLICACIÓN

/** Publicaciones por semana en las últimas `weeks` semanas (la última es la más reciente) y la media semanal. */
export function weeklyRhythm(publishedAt: string[], nowIso: string, weeks = 4) {
  const now = new Date(nowIso).getTime();
  const buckets = Array.from({ length: weeks }, () => 0);
  for (const iso of publishedAt) {
    const age = now - new Date(iso).getTime();
    if (age < 0) continue;
    const idx = Math.floor(age / (7 * DAY_MS));
    if (idx < weeks) buckets[weeks - 1 - idx]++;
  }
  const total = buckets.reduce((a, b) => a + b, 0);
  return { buckets, perWeek: total / weeks };
}

/** Porcentaje de éxito (0-100) o null si no hubo intentos. */
export function successRate(published: number, failed: number) {
  const total = published + failed;
  return total === 0 ? null : Math.round((published / total) * 100);
}

// ------------------------------------------------------------------------------------- CRÉDITOS

/** Créditos gastados (netos de reembolsos) a partir de los movimientos del libro de créditos. */
export function creditsSpent(rows: { delta: number; reason: string }[]) {
  let spent = 0;
  let refunded = 0;
  for (const r of rows) {
    if (r.delta < 0) spent += -r.delta;
    else if (r.reason.startsWith("refund")) refunded += r.delta;
  }
  return Math.max(0, spent - refunded);
}

// ------------------------------------------------------------------------------------- SEMANA

export type WeekDay = { day: string; count: number; isToday: boolean };

/** Tira de 7 días desde hoy (en la zona horaria dada) con el número de publicaciones de cada día. */
export function weekStrip(scheduledAt: string[], nowIso: string, timeZone: string): WeekDay[] {
  const today = dayIn(new Date(nowIso), timeZone);
  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(today, i));
  const counts = new Map(days.map((d) => [d, 0]));
  for (const iso of scheduledAt) {
    const k = dayIn(new Date(iso), timeZone);
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }
  return days.map((d, i) => ({ day: d, count: counts.get(d)!, isToday: i === 0 }));
}
