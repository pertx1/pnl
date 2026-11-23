/**
 * «Mi agenda»: lógica pura (sin Supabase ni React) para poder probarla y usarla igual en la app, en el panel general y en el MCP.
 * - Recurrencias: bloques puntuales o semanales (días ISO), con fecha de fin y días saltados.
 * - Huecos libres: dentro de la jornada (por defecto 08:00–23:00, Europe/Madrid), en instantes reales (UTC) para que el
 *   cambio de hora no descuadre las duraciones.
 * - Reparto: coloca tareas y preparación de publicaciones en los huecos, priorizando lo que vence antes. Es una PROPUESTA.
 * Tests: tests/unit/agenda.test.ts
 */
import { addDays, DEFAULT_TZ, daysBetween, hhmm, zonedParts, zonedToUtc } from "@/lib/mcp/calendar";

export { addDays, daysBetween, hhmm, DEFAULT_TZ };

export const AGENDA_KINDS = ["work", "study", "sport", "personal", "creation", "other"] as const;
export type AgendaKind = (typeof AGENDA_KINDS)[number];

/** Jornada por defecto: 08:00–23:00 en Europe/Madrid. */
export const DEFAULT_DAY = { startMinute: 8 * 60, endMinute: 23 * 60, timezone: DEFAULT_TZ } as const;
export type DaySettings = { startMinute: number; endMinute: number; timezone: string };

export type BlockLike = {
  id: string;
  title: string;
  kind: AgendaKind;
  note?: string;
  start_day: string;
  end_day: string | null;
  start_minute: number;
  end_minute: number;
  repeat_days: number[];
  skipped_days: string[];
  timezone: string;
  project_id?: string | null;
  task_id?: string | null;
  post_id?: string | null;
};

export type Occurrence = {
  blockId: string;
  day: string;
  startMinute: number;
  endMinute: number;
  /** Instantes reales (ISO UTC). */
  start: string;
  end: string;
  title: string;
  kind: AgendaKind;
  note: string;
  recurring: boolean;
  projectId: string | null;
  taskId: string | null;
  postId: string | null;
};

/** "09:30" → 570. Acepta "24:00" (fin del día). Devuelve null si no es válido. */
export function parseTime(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

/** Día de la semana ISO (1 = lunes … 7 = domingo) de un día YYYY-MM-DD (de calendario, sin zona). */
export function isoWeekday(day: string) {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Lunes de la semana de `day`. */
export function weekStart(day: string) {
  return addDays(day, 1 - isoWeekday(day));
}

/** Instante real de las `minutes` locales de `day` (1440 = medianoche del día siguiente). */
export function localToUtc(day: string, minutes: number, tz: string) {
  if (minutes >= 1440) return zonedToUtc(addDays(day, 1), minutes - 1440, tz);
  return zonedToUtc(day, minutes, tz);
}

/** ¿Ocurre el bloque ese día? */
export function occursOn(b: BlockLike, day: string) {
  if (day < b.start_day) return false;
  if (b.end_day && day > b.end_day) return false;
  if (b.skipped_days.includes(day)) return false;
  if (!b.repeat_days.length) return day === b.start_day;
  return b.repeat_days.includes(isoWeekday(day));
}

/** Ocurrencias de los bloques entre `from` y `to` (incluidos), ordenadas por inicio. */
export function expandBlocks(blocks: BlockLike[], from: string, to: string): Occurrence[] {
  const days = daysBetween(from, to);
  const out: Occurrence[] = [];
  for (const b of blocks) {
    for (const day of days) {
      if (!occursOn(b, day)) continue;
      out.push({
        blockId: b.id,
        day,
        startMinute: b.start_minute,
        endMinute: b.end_minute,
        start: localToUtc(day, b.start_minute, b.timezone).toISOString(),
        end: localToUtc(day, b.end_minute, b.timezone).toISOString(),
        title: b.title,
        kind: b.kind,
        note: b.note ?? "",
        recurring: b.repeat_days.length > 0,
        projectId: b.project_id ?? null,
        taskId: b.task_id ?? null,
        postId: b.post_id ?? null,
      });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

// ------------------------------------------------------------------------------------- HUECOS LIBRES

export type Interval = { start: number; end: number };

/** Une intervalos solapados o contiguos. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out.at(-1);
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

export type FreeSlot = { day: string; start: string; end: string; startTime: string; endTime: string; minutes: number };

/**
 * Huecos libres de un día dentro de la jornada, restando los intervalos ocupados.
 * Con `nowMs`, hoy solo cuenta desde ahora (redondeado a 5 min) y los días pasados quedan vacíos.
 * Las duraciones son reales: el día del cambio de hora una jornada de 0:00 a 24:00 dura 23 o 25 h.
 */
export function freeSlotsForDay(o: { day: string; settings: DaySettings; busy: Interval[]; nowMs?: number; minMinutes?: number }): { slots: FreeSlot[]; totalMinutes: number } {
  const tz = o.settings.timezone;
  let from = localToUtc(o.day, o.settings.startMinute, tz).getTime();
  const to = localToUtc(o.day, o.settings.endMinute, tz).getTime();
  if (o.nowMs !== undefined && o.nowMs > from) from = Math.ceil(o.nowMs / 300_000) * 300_000;
  const min = (o.minMinutes ?? 15) * 60_000;
  const slots: FreeSlot[] = [];
  if (from >= to) return { slots, totalMinutes: 0 };

  let cursor = from;
  const push = (s: number, e: number) => {
    if (e - s < min) return;
    slots.push({
      day: o.day,
      start: new Date(s).toISOString(),
      end: new Date(e).toISOString(),
      startTime: zonedParts(new Date(s), tz).time,
      endTime: e === localToUtc(o.day, 1440, tz).getTime() ? "24:00" : zonedParts(new Date(e), tz).time,
      minutes: Math.round((e - s) / 60_000),
    });
  };
  for (const b of mergeIntervals(o.busy)) {
    if (b.end <= cursor) continue;
    if (b.start >= to) break;
    if (b.start > cursor) push(cursor, b.start);
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < to) push(cursor, to);
  return { slots, totalMinutes: slots.reduce((a, s) => a + s.minutes, 0) };
}

/** Huecos libres de varios días a partir de las ocurrencias de la agenda. */
export function freeSlotsForRange(o: { days: string[]; settings: DaySettings; occurrences: Pick<Occurrence, "start" | "end">[]; nowMs?: number; minMinutes?: number }) {
  const busy = o.occurrences.map((x) => ({ start: new Date(x.start).getTime(), end: new Date(x.end).getTime() }));
  return o.days.map((day) => ({ day, ...freeSlotsForDay({ day, settings: o.settings, busy, nowMs: o.nowMs, minMinutes: o.minMinutes }) }));
}

/** 200 → { h: 3, m: 20 }. */
export function splitMinutes(total: number) {
  const t = Math.max(0, Math.round(total));
  return { h: Math.floor(t / 60), m: t % 60 };
}

// ------------------------------------------------------------------------------------- REPARTO

export type PlanItemType = "task" | "post";
export type PlanItem = {
  /** Id estable del elemento (task:<uuid> / post:<uuid>). */
  id: string;
  type: PlanItemType;
  title: string;
  projectId: string | null;
  /** Fecha límite (YYYY-MM-DD local, incluida) o null. */
  due: string | null;
  minutes: number;
  taskId?: string | null;
  postId?: string | null;
};

export type Proposal = {
  itemId: string;
  day: string;
  start: string;
  end: string;
  startTime: string;
  endTime: string;
  minutes: number;
  /** true si no cabía antes de su fecha límite y se ha puesto después. */
  late: boolean;
};

/** Duraciones de referencia (minutos), editables en la propuesta. */
export const DURATIONS = { record: 60, edit: 45, write: 20, task: 45, post: 30 } as const;

/** Duración estimada por el título: grabar 60, editar 45, escribir/guion 20; si no, 45 (tarea) o 30 (preparar publicación). */
export function estimateMinutes(title: string, type: PlanItemType) {
  const t = title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (/\b(grab|film|record|shoot|rodar|rodaje)/.test(t)) return DURATIONS.record;
  if (/\b(edit|montaj|mont[ae]r|cortar)/.test(t)) return DURATIONS.edit;
  if (/\b(escrib|guion|copy|caption|texto|write|script|hook)/.test(t)) return DURATIONS.write;
  return type === "task" ? DURATIONS.task : DURATIONS.post;
}

/** Orden de prioridad: lo que vence antes primero (sin fecha al final); a igualdad, tareas antes que publicaciones. */
export function sortPlanItems(items: PlanItem[]) {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (a.it.due ?? "9999-12-31").localeCompare(b.it.due ?? "9999-12-31") || (a.it.type === b.it.type ? 0 : a.it.type === "task" ? -1 : 1) || a.i - b.i)
    .map((x) => x.it);
}

/**
 * Reparte los elementos en los huecos libres (sin partirlos), con `gapMinutes` de descanso entre bloques.
 * Prioriza lo que vence antes; cada elemento va al primer hueco donde cabe antes de su fecha límite y, si no cabe,
 * al primero disponible después (marcado como `late`). Lo que no cabe en ningún hueco queda en `unplaced`.
 */
export function planTime(o: { items: PlanItem[]; slots: FreeSlot[]; timezone: string; gapMinutes?: number }): { proposals: Proposal[]; unplaced: string[] } {
  const gap = (o.gapMinutes ?? 10) * 60_000;
  const free = o.slots
    .map((s) => ({ day: s.day, cursor: new Date(s.start).getTime(), end: new Date(s.end).getTime() }))
    .sort((a, b) => a.cursor - b.cursor);
  const proposals: Proposal[] = [];
  const unplaced: string[] = [];

  for (const it of sortPlanItems(o.items)) {
    const need = Math.max(5, Math.round(it.minutes)) * 60_000;
    const fits = (s: (typeof free)[number]) => s.end - s.cursor >= need;
    const slot = free.find((s) => fits(s) && (!it.due || s.day <= it.due)) ?? free.find(fits);
    if (!slot) {
      unplaced.push(it.id);
      continue;
    }
    const start = slot.cursor;
    const end = start + need;
    slot.cursor = Math.min(slot.end, Math.ceil((end + gap) / 300_000) * 300_000);
    proposals.push({
      itemId: it.id,
      day: slot.day,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      startTime: zonedParts(new Date(start), o.timezone).time,
      endTime: zonedParts(new Date(end), o.timezone).time,
      minutes: Math.round(need / 60_000),
      late: !!it.due && slot.day > it.due,
    });
  }
  return { proposals: proposals.sort((a, b) => a.start.localeCompare(b.start)), unplaced };
}

/** Minutos locales (inicio/fin) de una propuesta, para guardarla como bloque. Cruza medianoche → se recorta a 24:00. */
export function proposalToMinutes(p: Pick<Proposal, "start" | "end" | "day">, tz: string) {
  const s = zonedParts(new Date(p.start), tz);
  const e = zonedParts(new Date(p.end), tz);
  const startMinute = s.minutes;
  const endMinute = e.day === p.day ? e.minutes : 1440;
  return { startMinute, endMinute: Math.max(endMinute, startMinute + 1) };
}

// ------------------------------------------------------------------------------------- LÍMITES

/** Límites de la agenda calculados una vez por petición (la página no llama a Date.now() al renderizar). */
export function agendaBounds(now: number = Date.now(), timeZone: string = DEFAULT_TZ) {
  const today = zonedParts(new Date(now), timeZone).day;
  return { nowMs: now, nowIso: new Date(now).toISOString(), today, weekStart: weekStart(today), in7: addDays(today, 6) };
}

/** Rango de días a mostrar: un día o la semana (lunes–domingo) que contiene `anchor`. */
export function viewRange(view: "day" | "week", anchor: string) {
  if (view === "day") return { from: anchor, to: anchor };
  const from = weekStart(anchor);
  return { from, to: addDays(from, 6) };
}

/** Días ISO ordenados y sin repetir a partir de una lista cualquiera. */
export function normalizeRepeatDays(days: number[]) {
  return [...new Set(days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
}
