/**
 * Utilidades puras del calendario para el MCP: días locales en una zona horaria IANA y cálculo de huecos libres
 * respetando el límite diario por cuenta (anti-baneo). Sin acceso a BD (tests en tests/unit/mcp-calendar.test.ts).
 */

export const DEFAULT_TZ = "Europe/Madrid";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isIsoDay(s: string) {
  if (!DAY_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lista de días [from, to] (ambos incluidos). */
export function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Fecha/hora local de un instante en la zona `tz`. */
export function zonedParts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
  const parts = Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: String(parts.weekday) };
}

/** Desfase (ms) de la zona respecto a UTC en un instante. */
function offsetMs(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instante UTC de las HH:MM locales de `day` en la zona `tz` (tiene en cuenta el cambio de hora). */
export function zonedToUtc(day: string, minutes: number, tz: string) {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t);
}

export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Estados que ocupan el límite diario de una cuenta (mismos que comprueba la aprobación, más los pendientes de aprobar). */
export const PLANNED_STATUSES = ["pending_approval", "approved", "scheduled", "publishing", "published"] as const;

export type SlotAccount = {
  id: string;
  platform: string;
  handle: string | null;
  dailyLimit: number;
  preferredHour: number;
  /** Puntuación 0–100 por [día 0=lunes][hora local] (src/lib/analytics/best-time.ts). Si está, ordena las horas sugeridas. */
  hourScores?: number[][];
};
const WEEKDAY_IDX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
export type SlotPost = { scheduledAt: string; status: string; accountIds: string[] };
export type FreeDay = {
  date: string;
  weekday: string;
  busy_times: string[];
  free_windows: { start: string; end: string }[];
  accounts: {
    account_id: string;
    platform: string;
    handle: string | null;
    daily_limit: number;
    planned: number;
    drafts: number;
    remaining: number;
    suggested_time: string | null;
    /** Solo con puntuación de mejores horas: horas libres de mejor a peor y la puntuación (0–100) de la sugerida. */
    ranked_times?: string[];
    best_time_score?: number;
  }[];
  completely_free: boolean;
};

/**
 * Huecos libres por día: franjas sin publicaciones (con un margen alrededor de cada una) dentro del horario de trabajo,
 * y capacidad restante por cuenta según su límite diario. Los días pasados se omiten; hoy empieza en la hora actual.
 */
export function computeFreeSlots(o: {
  days: string[];
  tz: string;
  now: Date;
  accounts: SlotAccount[];
  posts: SlotPost[];
  windowStartHour?: number;
  windowEndHour?: number;
  bufferMinutes?: number;
  minWindowMinutes?: number;
}): FreeDay[] {
  const startMin = (o.windowStartHour ?? 8) * 60;
  const endMin = (o.windowEndHour ?? 22) * 60;
  const buffer = o.bufferMinutes ?? 60;
  const minWindow = o.minWindowMinutes ?? 30;
  const nowParts = zonedParts(o.now, o.tz);

  const byDay = new Map<string, { minutes: number; status: string; accountIds: string[] }[]>();
  for (const p of o.posts) {
    const z = zonedParts(new Date(p.scheduledAt), o.tz);
    const list = byDay.get(z.day) ?? [];
    list.push({ minutes: z.minutes, status: p.status, accountIds: p.accountIds });
    byDay.set(z.day, list);
  }

  const out: FreeDay[] = [];
  for (const day of o.days) {
    if (day < nowParts.day) continue;
    const posts = (byDay.get(day) ?? []).sort((a, b) => a.minutes - b.minutes);
    let from = startMin;
    if (day === nowParts.day) from = Math.max(from, Math.ceil((nowParts.minutes + 15) / 30) * 30);

    // Franjas libres: [from, end] menos [t - buffer, t + buffer] de cada publicación.
    const windows: { start: number; end: number }[] = [];
    let cursor = from;
    for (const p of posts) {
      const bStart = p.minutes - buffer;
      const bEnd = p.minutes + buffer;
      if (bStart > cursor) windows.push({ start: cursor, end: Math.min(bStart, endMin) });
      cursor = Math.max(cursor, bEnd);
    }
    if (cursor < endMin) windows.push({ start: cursor, end: endMin });
    const free = windows.filter((w) => w.end - w.start >= minWindow);
    const weekday = zonedParts(zonedToUtc(day, 12 * 60, o.tz), o.tz).weekday;
    const weekdayIdx = WEEKDAY_IDX[weekday] ?? 0;

    const accounts = o.accounts.map((a) => {
      const mine = posts.filter((p) => p.accountIds.includes(a.id));
      const planned = mine.filter((p) => (PLANNED_STATUSES as readonly string[]).includes(p.status)).length;
      const drafts = mine.filter((p) => p.status === "draft").length;
      let remaining = Math.max(0, a.dailyLimit - planned);
      let suggested: string | null = null;
      let ranked: { at: number; score: number }[] | null = null;
      if (remaining > 0 && free.length && a.hourScores) {
        // Con datos de mejores horas: candidatas cada 30 min dentro de las franjas libres, por puntuación
        // (empate → la más cercana a la hora preferida).
        const row = a.hourScores[weekdayIdx] ?? [];
        const pref = a.preferredHour * 60;
        const cands: { at: number; score: number; dist: number }[] = [];
        for (const w of free) {
          for (let at = Math.ceil(w.start / 30) * 30; at <= w.end - minWindow; at += 30) {
            cands.push({ at, score: row[Math.floor(at / 60)] ?? 0, dist: Math.abs(at - pref) });
          }
        }
        cands.sort((x, y) => y.score - x.score || x.dist - y.dist || x.at - y.at);
        ranked = [];
        for (const c of cands) {
          if (ranked.length >= 3) break;
          if (ranked.some((r) => Math.abs(r.at - c.at) < 60)) continue;
          ranked.push(c);
        }
        if (ranked.length) suggested = hhmm(ranked[0].at);
      } else if (remaining > 0 && free.length) {
        const pref = a.preferredHour * 60;
        let best: { at: number; dist: number } | null = null;
        for (const w of free) {
          const at = Math.min(Math.max(pref, w.start), w.end - minWindow);
          const dist = Math.abs(at - pref);
          if (!best || dist < best.dist) best = { at, dist };
        }
        if (best) suggested = hhmm(Math.ceil(best.at / 15) * 15);
      }
      // La aprobación (post_limit_violations) cuenta por día UTC, no por día local: si el día UTC de la hora sugerida ya
      // está lleno (p. ej. por publicaciones de madrugada del día local siguiente), se avisa como sin hueco.
      if (suggested) {
        const [hh, mm] = suggested.split(":").map(Number);
        const utcDay = zonedToUtc(day, hh * 60 + mm, o.tz).toISOString().slice(0, 10);
        const plannedUtc = o.posts.filter(
          (p) => p.accountIds.includes(a.id) && (PLANNED_STATUSES as readonly string[]).includes(p.status) && new Date(p.scheduledAt).toISOString().slice(0, 10) === utcDay,
        ).length;
        remaining = Math.min(remaining, Math.max(0, a.dailyLimit - plannedUtc));
        if (remaining === 0) suggested = null;
      }
      const base = { account_id: a.id, platform: a.platform, handle: a.handle, daily_limit: a.dailyLimit, planned, drafts, remaining, suggested_time: suggested };
      if (!ranked) return base;
      return { ...base, ranked_times: suggested ? ranked.map((r) => hhmm(r.at)) : [], best_time_score: suggested ? ranked[0].score : undefined };
    });

    out.push({
      date: day,
      weekday,
      busy_times: posts.map((p) => hhmm(p.minutes)),
      free_windows: free.map((w) => ({ start: hhmm(w.start), end: hhmm(w.end) })),
      accounts,
      completely_free: posts.length === 0,
    });
  }
  return out;
}
