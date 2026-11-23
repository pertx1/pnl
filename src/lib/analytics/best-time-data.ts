import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DEFAULT_TZ } from "@/lib/mcp/calendar";
import { bestTimes, isBestTimePlatform, type BestTimePlatform, type BestTimesResult, type HistoryPoint } from "./best-time";

/**
 * Carga el historial propio para «Mejores horas» y calcula el resultado por proyecto y red.
 * Sirve con el cliente del usuario (RLS) o con el de servicio DESPUÉS de comprobar permisos (MCP, Inngest).
 *
 * Puntuación de cada publicación hecha con Kreo (post_targets publicados en los últimos 180 días):
 *  1. Métricas por publicación (`post_metrics`, última captura): visualizaciones; si no hay, likes+comentarios+
 *     compartidos+guardados. Hoy ningún proceso rellena aún post_metrics: queda listo para cuando exista.
 *  2. Si no hay, APROXIMACIÓN (`proxy`, pesa la mitad): seguidores ganados por la cuenta entre el día anterior y el
 *     siguiente a la publicación (account_metrics_daily), solo si ese día la cuenta publicó UNA vez con Kreo.
 *  YouTube: nunca se calcula nada con sus datos (sus normas prohíben métricas derivadas): solo patrón orientativo.
 */
type Db = SupabaseClient<Database>;
const HISTORY_DAYS = 180;

export type ProjectBestTimes = Map<string, Map<BestTimePlatform, BestTimesResult>>;

function addDaysIso(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Historial puntuado por proyecto y red (clave `${projectId}:${platform}`). */
export async function loadBestTimeHistory(db: Db, projectIds: string[], now: Date = new Date()) {
  const out = new Map<string, HistoryPoint[]>();
  const accountsByProject = new Map<string, { id: string; platform: BestTimePlatform }[]>();
  if (!projectIds.length) return { history: out, accountsByProject };

  const { data: accounts } = await db.from("social_accounts").select("id, project_id, platform").in("project_id", projectIds);
  for (const a of accounts ?? []) {
    if (!isBestTimePlatform(a.platform)) continue;
    const list = accountsByProject.get(a.project_id) ?? [];
    list.push({ id: a.id, platform: a.platform });
    accountsByProject.set(a.project_id, list);
  }
  // YouTube fuera: no se leen ni sus métricas ni su historial.
  const usable = (accounts ?? []).filter((a) => a.platform !== "youtube");
  if (!usable.length) return { history: out, accountsByProject };
  const accountIds = usable.map((a) => a.id);
  const accountInfo = new Map(usable.map((a) => [a.id, a]));

  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString();
  const { data: targets } = await db
    .from("post_targets")
    .select("id, social_account_id, published_at")
    .in("social_account_id", accountIds)
    .eq("status", "published")
    .not("published_at", "is", null)
    .gte("published_at", since)
    .limit(2000);
  if (!targets?.length) return { history: out, accountsByProject };

  // 1) Métricas por publicación (tabla aún sin tipos generados: consulta sin tipar con su forma conocida).
  const loose = db as unknown as SupabaseClient;
  const perPost = new Map<string, number>();
  const { data: pm } = await loose
    .from("post_metrics")
    .select("post_target_id, views, likes, comments, shares, saves, captured_at")
    .in("post_target_id", targets.map((t) => t.id))
    .order("captured_at", { ascending: false })
    .limit(5000);
  for (const m of (pm ?? []) as { post_target_id: string; views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null }[]) {
    if (perPost.has(m.post_target_id)) continue; // la más reciente
    const score = m.views ?? (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
    if (Number.isFinite(score)) perPost.set(m.post_target_id, Number(score));
  }

  // 2) Aproximación con seguidores diarios.
  const needProxy = targets.filter((t) => !perPost.has(t.id));
  const followers = new Map<string, number>(); // `${accountId}:${day}` → seguidores
  if (needProxy.length) {
    const { data: daily } = await db
      .from("account_metrics_daily")
      .select("social_account_id, day, followers")
      .in("social_account_id", [...new Set(needProxy.map((t) => t.social_account_id))])
      .gte("day", since.slice(0, 10))
      .limit(5000);
    for (const d of daily ?? []) if (d.followers !== null) followers.set(`${d.social_account_id}:${d.day}`, Number(d.followers));
  }
  const postsPerDay = new Map<string, number>();
  for (const t of targets) {
    const k = `${t.social_account_id}:${t.published_at!.slice(0, 10)}`;
    postsPerDay.set(k, (postsPerDay.get(k) ?? 0) + 1);
  }

  for (const t of targets) {
    const acc = accountInfo.get(t.social_account_id);
    if (!acc) continue;
    let point: HistoryPoint | null = null;
    if (perPost.has(t.id)) point = { publishedAt: t.published_at!, score: perPost.get(t.id)! };
    else {
      const day = t.published_at!.slice(0, 10);
      const before = followers.get(`${t.social_account_id}:${addDaysIso(day, -1)}`);
      const after = followers.get(`${t.social_account_id}:${addDaysIso(day, 1)}`);
      if (postsPerDay.get(`${t.social_account_id}:${day}`) === 1 && before !== undefined && after !== undefined) {
        point = { publishedAt: t.published_at!, score: Math.max(0, after - before), proxy: true };
      }
    }
    if (!point) continue;
    const key = `${acc.project_id}:${acc.platform}`;
    const list = out.get(key) ?? [];
    list.push(point);
    out.set(key, list);
  }
  return { history: out, accountsByProject };
}

/** Resultado por proyecto y red (solo redes con cuentas conectadas en ese proyecto, o las pedidas en `platforms`). */
export async function loadProjectBestTimes(
  db: Db,
  projectIds: string[],
  opts: { timezone?: string; platforms?: BestTimePlatform[]; now?: Date } = {},
): Promise<ProjectBestTimes> {
  const { history, accountsByProject } = await loadBestTimeHistory(db, projectIds, opts.now);
  const out: ProjectBestTimes = new Map();
  for (const pid of projectIds) {
    const platforms = opts.platforms ?? [...new Set((accountsByProject.get(pid) ?? []).map((a) => a.platform))];
    const m = new Map<BestTimePlatform, BestTimesResult>();
    for (const p of platforms) m.set(p, bestTimes(p, history.get(`${pid}:${p}`) ?? [], { timezone: opts.timezone ?? DEFAULT_TZ }));
    out.set(pid, m);
  }
  return out;
}
