/**
 * Resumen semanal de un proyecto. Lógica pura (sin BD): tests en tests/unit/notifications.test.ts.
 * - Periodo: los 7 días locales anteriores a `today` (el lunes del envío → de lunes a domingo pasados).
 * - Próxima semana: `today` y los 6 días siguientes.
 * - Seguidores por cuenta con su variación. YouTube va APARTE, solo con la cifra actual de suscriptores, sin
 *   variación ni sumas (Developer Policies de YouTube III.E.4: nada de métricas derivadas ni combinadas).
 * Solo datos del propio proyecto (títulos y @ propios, contadores); nada de terceros.
 */
import { addDays, zonedToUtc } from "@/lib/mcp/calendar";

export const WEEKLY_SUMMARY_VERSION = 1;

export type WeeklyInput = {
  project: { id: string; name: string };
  today: string; // YYYY-MM-DD local
  timezone: string;
  accounts: { id: string; platform: string; handle: string | null; display_name: string | null; status: string }[];
  metrics: { social_account_id: string; day: string; followers: number | null }[];
  targets: { social_account_id: string; status: string; published_at: string | null; updated_at: string }[];
  upcoming: { id: string; title: string | null; scheduled_at: string; status: string; platforms: string[] }[];
  overdueTasks: { id: string; title: string; due_date: string }[];
};

export type WeeklySummary = {
  version: number;
  project: { id: string; name: string };
  timezone: string;
  period: { from: string; to: string };
  next: { from: string; to: string };
  accounts: { id: string; platform: string; label: string; followers: number | null; change: number | null; status: string }[];
  youtube: { id: string; label: string; subscribers: number | null; status: string }[];
  posts: { published: number; failed: number; byPlatform: Record<string, { published: number; failed: number }> };
  upcoming: { count: number; pendingApproval: number; items: { id: string; title: string | null; at: string; status: string; platforms: string[] }[] };
  overdueTasks: { count: number; items: { id: string; title: string; due: string }[] };
};

const label = (a: { handle: string | null; display_name: string | null; platform: string }) =>
  a.handle ? `@${a.handle.replace(/^@/, "")}` : (a.display_name ?? a.platform).slice(0, 80);

/** Seguidores del último día ≤ `day` (o null si no hay datos). */
function followersAt(rows: { day: string; followers: number | null }[], day: string) {
  let best: { day: string; followers: number } | null = null;
  for (const r of rows) {
    if (r.followers === null || r.day > day) continue;
    if (!best || r.day > best.day) best = { day: r.day, followers: Number(r.followers) };
  }
  return best;
}

export function weeklyPeriod(today: string) {
  return { period: { from: addDays(today, -7), to: addDays(today, -1) }, next: { from: today, to: addDays(today, 6) } };
}

export function buildWeeklySummary(i: WeeklyInput): WeeklySummary {
  const { period, next } = weeklyPeriod(i.today);
  const startUtc = zonedToUtc(period.from, 0, i.timezone).getTime();
  const endUtc = zonedToUtc(i.today, 0, i.timezone).getTime();
  const inPeriod = (iso: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= startUtc && t < endUtc;
  };

  const byAccount = new Map<string, { day: string; followers: number | null }[]>();
  for (const m of i.metrics) {
    const list = byAccount.get(m.social_account_id) ?? [];
    list.push(m);
    byAccount.set(m.social_account_id, list);
  }

  const accounts: WeeklySummary["accounts"] = [];
  const youtube: WeeklySummary["youtube"] = [];
  for (const a of i.accounts) {
    const rows = byAccount.get(a.id) ?? [];
    const now = followersAt(rows, period.to);
    if (a.platform === "youtube") {
      youtube.push({ id: a.id, label: label(a), subscribers: now?.followers ?? null, status: a.status });
      continue;
    }
    const before = followersAt(rows, addDays(period.from, -1));
    accounts.push({
      id: a.id,
      platform: a.platform,
      label: label(a),
      followers: now?.followers ?? null,
      change: now && before && before.day < now.day ? now.followers - before.followers : null,
      status: a.status,
    });
  }

  const platformOf = new Map(i.accounts.map((a) => [a.id, a.platform]));
  const byPlatform: WeeklySummary["posts"]["byPlatform"] = {};
  let published = 0;
  let failed = 0;
  for (const t of i.targets) {
    const p = platformOf.get(t.social_account_id) ?? "other";
    const slot = (byPlatform[p] ??= { published: 0, failed: 0 });
    if (t.status === "published" && inPeriod(t.published_at)) {
      published++;
      slot.published++;
    } else if (t.status === "failed" && inPeriod(t.updated_at)) {
      failed++;
      slot.failed++;
    }
  }
  for (const k of Object.keys(byPlatform)) if (!byPlatform[k].published && !byPlatform[k].failed) delete byPlatform[k];

  const nextStart = endUtc;
  const nextEnd = zonedToUtc(addDays(next.to, 1), 0, i.timezone).getTime();
  const upcoming = i.upcoming
    .filter((u) => {
      const t = new Date(u.scheduled_at).getTime();
      return t >= nextStart && t < nextEnd && ["pending_approval", "approved", "scheduled"].includes(u.status);
    })
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  const overdue = i.overdueTasks.filter((t) => t.due_date < i.today).sort((a, b) => a.due_date.localeCompare(b.due_date));

  return {
    version: WEEKLY_SUMMARY_VERSION,
    project: i.project,
    timezone: i.timezone,
    period,
    next,
    accounts,
    youtube,
    posts: { published, failed, byPlatform },
    upcoming: {
      count: upcoming.length,
      pendingApproval: upcoming.filter((u) => u.status === "pending_approval").length,
      items: upcoming.slice(0, 10).map((u) => ({ id: u.id, title: u.title ? u.title.slice(0, 120) : null, at: u.scheduled_at, status: u.status, platforms: u.platforms })),
    },
    overdueTasks: { count: overdue.length, items: overdue.slice(0, 10).map((t) => ({ id: t.id, title: t.title.slice(0, 120), due: t.due_date })) },
  };
}

/**
 * Copia para GUARDAR como aviso: sin datos de la API de YouTube (nombre del canal ni suscriptores), solo el id de la
 * cuenta. Se rellenan en vivo al mostrar el aviso con `hydrateYouTube`.
 */
export function stripYouTubeData(s: WeeklySummary): WeeklySummary {
  return { ...s, youtube: s.youtube.map((y) => ({ id: y.id, label: "", subscribers: null, status: y.status })) };
}

/**
 * Rellena el bloque de YouTube con los datos actuales (cuentas y última cifra guardada, ambos sujetos a los plazos de
 * YouTube). Las cuentas que ya no existen (desconectadas o borradas) desaparecen del resumen.
 */
export function hydrateYouTube(
  s: WeeklySummary,
  accounts: { id: string; platform: string; handle: string | null; display_name: string | null; status: string }[],
  latest: Map<string, number | null>,
): WeeklySummary {
  const byId = new Map(accounts.filter((a) => a.platform === "youtube").map((a) => [a.id, a]));
  return {
    ...s,
    youtube: s.youtube.flatMap((y) => {
      const a = byId.get(y.id);
      return a ? [{ id: a.id, label: label(a), subscribers: latest.get(a.id) ?? null, status: a.status }] : [];
    }),
  };
}

/** ¿Merece la pena enviarlo? (sin cuentas, publicaciones ni tareas no se manda nada). */
export function weeklyHasContent(s: WeeklySummary) {
  return s.accounts.length + s.youtube.length + s.posts.published + s.posts.failed + s.upcoming.count + s.overdueTasks.count > 0;
}
