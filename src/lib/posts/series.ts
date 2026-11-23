/**
 * Series de publicaciones: fechas de una recurrencia semanal en una zona horaria (Europe/Madrid por defecto,
 * con cambios de hora) y comprobación del límite diario por cuenta (anti-baneo). Lógica pura, sin BD.
 * Tests en tests/unit/templates.test.ts.
 *
 * Una serie solo crea BORRADORES o PENDIENTES DE APROBACIÓN. Nunca aprueba ni publica (regla nº 1).
 */
import { addDays, isIsoDay, PLANNED_STATUSES, zonedParts, zonedToUtc } from "@/lib/mcp/calendar";

export const SERIES_TZ = "Europe/Madrid";
export const SERIES_MAX = 52;
/** No se crean publicaciones más allá de un año. */
export const SERIES_MAX_DAYS = 366;
/** Margen mínimo con el momento actual para que una fecha cuente (las pasadas o inminentes se saltan). */
export const SERIES_MIN_LEAD_MINUTES = 15;

/** Días ISO: 1 = lunes … 7 = domingo. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Recurrence = {
  /** Primer día posible (YYYY-MM-DD, en la zona de la serie). */
  startDate: string;
  /** Días de la semana en que se publica. */
  weekdays: Weekday[];
  /** Hora local HH:MM. */
  time: string;
  /** Número de publicaciones a crear. */
  count: number;
  /** Cada cuántas semanas (1 = todas, 2 = semanas alternas…). */
  intervalWeeks: number;
};

export type Occurrence = {
  /** Día local (YYYY-MM-DD). */
  day: string;
  /** Hora local real (HH:MM); difiere de la pedida si cae en el hueco del cambio de hora. */
  time: string;
  /** Instante UTC (ISO). */
  at: string;
  /** true si la hora pedida no existe ese día (cambio de hora de primavera) y se ha movido. */
  shifted: boolean;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Día ISO de la semana (1 = lunes) de una fecha YYYY-MM-DD. */
export function isoWeekday(day: string): Weekday {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return (d === 0 ? 7 : d) as Weekday;
}

export function isValidRecurrence(r: Recurrence) {
  return (
    isIsoDay(r.startDate) &&
    TIME_RE.test(r.time) &&
    r.weekdays.length > 0 &&
    r.weekdays.every((w) => Number.isInteger(w) && w >= 1 && w <= 7) &&
    Number.isInteger(r.count) &&
    r.count >= 1 &&
    r.count <= SERIES_MAX &&
    Number.isInteger(r.intervalWeeks) &&
    r.intervalWeeks >= 1 &&
    r.intervalWeeks <= 4
  );
}

/**
 * Fechas de la serie, en orden. Se saltan las que ya han pasado (o empiezan en menos de 15 min) sin contarlas.
 * Las semanas se cuentan desde el lunes de la semana de `startDate`.
 */
export function seriesOccurrences(r: Recurrence, o: { now: Date; tz?: string }): { occurrences: Occurrence[]; skippedPast: number } {
  const tz = o.tz ?? SERIES_TZ;
  if (!isValidRecurrence(r)) return { occurrences: [], skippedPast: 0 };
  const [hh, mm] = r.time.split(":").map(Number);
  const minutes = hh * 60 + mm;
  const minAt = o.now.getTime() + SERIES_MIN_LEAD_MINUTES * 60_000;
  const weekStart = addDays(r.startDate, 1 - isoWeekday(r.startDate));
  const days = new Set(r.weekdays);
  const out: Occurrence[] = [];
  let skippedPast = 0;
  for (let i = 0; i < SERIES_MAX_DAYS && out.length < r.count; i++) {
    const day = addDays(r.startDate, i);
    const week = Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / (7 * 86_400_000));
    if (week % r.intervalWeeks !== 0 || !days.has(isoWeekday(day))) continue;
    const at = zonedToUtc(day, minutes, tz);
    if (at.getTime() < minAt) {
      skippedPast++;
      continue;
    }
    const local = zonedParts(at, tz);
    out.push({ day: local.day, time: local.time, at: at.toISOString(), shifted: local.time !== r.time || local.day !== day });
  }
  return { occurrences: out, skippedPast };
}

export type LimitAccount = { id: string; dailyLimit: number };
export type ExistingPost = { scheduledAt: string; status: string; accountIds: string[] };
export type PlannedOccurrence = Occurrence & { blockedAccountIds: string[] };

/**
 * Marca las fechas en las que alguna cuenta superaría su límite diario. Cuenta las publicaciones ya planificadas
 * (pendientes, aprobadas, programadas o publicadas) y las fechas anteriores de la propia serie que sí se crean.
 * Se comprueba por día local (lo que ve el usuario) y por día UTC (lo que comprueba la aprobación,
 * `post_limit_violations`), para que ninguna publicación de la serie choque luego al aprobarla.
 */
export function applyDailyLimits(occurrences: Occurrence[], accounts: LimitAccount[], existing: ExistingPost[], tz = SERIES_TZ): PlannedOccurrence[] {
  const counts = new Map<string, number>();
  const keys = (accountId: string, iso: string) => [`${accountId}|L|${zonedParts(new Date(iso), tz).day}`, `${accountId}|U|${iso.slice(0, 10)}`];
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const p of existing) {
    if (!(PLANNED_STATUSES as readonly string[]).includes(p.status)) continue;
    const iso = new Date(p.scheduledAt).toISOString();
    for (const a of p.accountIds) keys(a, iso).forEach(bump);
  }
  return occurrences.map((occ) => {
    const blocked = accounts.filter((a) => keys(a.id, occ.at).some((k) => (counts.get(k) ?? 0) + 1 > a.dailyLimit)).map((a) => a.id);
    if (!blocked.length) for (const a of accounts) keys(a.id, occ.at).forEach(bump);
    return { ...occ, blockedAccountIds: blocked };
  });
}

/** Rango [desde, hasta) en UTC que cubre todos los días locales y UTC de las fechas (para pedir las publicaciones existentes). */
export function occurrenceRange(occurrences: Occurrence[]): { from: string; to: string } | null {
  if (!occurrences.length) return null;
  const times = occurrences.map((o) => Date.parse(o.at));
  return { from: new Date(Math.min(...times) - 2 * 86_400_000).toISOString(), to: new Date(Math.max(...times) + 2 * 86_400_000).toISOString() };
}

/** Valores de los huecos para la publicación nº `index`: cada hueco toma la línea `index` de su lista (si existe). */
export function valuesForOccurrence(lists: Record<string, string[]>, index: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, list] of Object.entries(lists)) {
    const v = list[index]?.trim();
    if (v) out[name] = v;
  }
  return out;
}
