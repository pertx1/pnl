import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, DEFAULT_TZ, zonedParts, zonedToUtc } from "@/lib/mcp/calendar";
import type { Database, Json } from "@/lib/supabase/database.types";
import { notifyUsers, type Admin } from "./notify";
import { composeText } from "./text";
import { buildWeeklySummary, stripYouTubeData, weeklyHasContent, weeklyPeriod, type WeeklySummary } from "./weekly-core";

/**
 * Carga los datos de un proyecto y arma su resumen semanal (ver weekly-core.ts).
 * Usa el cliente de servicio: llamar SOLO desde Inngest o tras comprobar permisos (MCP).
 */
type Db = SupabaseClient<Database>;

export async function loadWeeklySummary(db: Db, project: { id: string; name: string }, now: Date = new Date(), tz = DEFAULT_TZ): Promise<WeeklySummary> {
  const today = zonedParts(now, tz).day;
  const { period, next } = weeklyPeriod(today);
  const startUtc = zonedToUtc(period.from, 0, tz).toISOString();
  const nextEndUtc = zonedToUtc(addDays(next.to, 1), 0, tz).toISOString();

  const { data: accounts } = await db.from("social_accounts").select("id, platform, handle, display_name, status").eq("project_id", project.id);
  const accountIds = (accounts ?? []).map((a) => a.id);
  const [metrics, targets, upcoming, tasks] = await Promise.all([
    accountIds.length
      ? db.from("account_metrics_daily").select("social_account_id, day, followers").in("social_account_id", accountIds).gte("day", addDays(period.from, -8)).lte("day", period.to)
      : Promise.resolve({ data: [] }),
    accountIds.length
      ? db.from("post_targets").select("social_account_id, status, published_at, updated_at").in("social_account_id", accountIds).in("status", ["published", "failed"]).gte("updated_at", startUtc).limit(2000)
      : Promise.resolve({ data: [] }),
    db
      .from("posts")
      .select("id, title, scheduled_at, status, post_targets(social_accounts(platform))")
      .eq("project_id", project.id)
      .in("status", ["pending_approval", "approved", "scheduled"])
      .gte("scheduled_at", zonedToUtc(today, 0, tz).toISOString())
      .lt("scheduled_at", nextEndUtc)
      .order("scheduled_at")
      .limit(200),
    db.from("roadmap_tasks").select("id, title, due_date, status").eq("project_id", project.id).neq("status", "done").lt("due_date", today).order("due_date").limit(200),
  ]);

  type UpRow = { id: string; title: string | null; scheduled_at: string | null; status: string; post_targets: { social_accounts: { platform: string } | null }[] | null };
  return buildWeeklySummary({
    project,
    today,
    timezone: tz,
    accounts: accounts ?? [],
    metrics: (metrics.data ?? []) as { social_account_id: string; day: string; followers: number | null }[],
    targets: (targets.data ?? []) as { social_account_id: string; status: string; published_at: string | null; updated_at: string }[],
    upcoming: ((upcoming.data ?? []) as unknown as UpRow[])
      .filter((u) => u.scheduled_at)
      .map((u) => ({
        id: u.id,
        title: u.title,
        scheduled_at: u.scheduled_at!,
        status: u.status,
        platforms: [...new Set((u.post_targets ?? []).map((t) => t.social_accounts?.platform).filter((p): p is string => Boolean(p)))],
      })),
    overdueTasks: (tasks.data ?? []).filter((t) => t.due_date).map((t) => ({ id: t.id, title: t.title, due_date: t.due_date! })),
  });
}

/** Guarda el resumen como aviso `weekly_summary` para cada miembro del workspace (uno por semana y proyecto). */
export async function sendWeeklySummary(db: Admin, project: { id: string; name: string; workspace_id: string }, now: Date = new Date()) {
  const summary = await loadWeeklySummary(db, project, now);
  if (!weeklyHasContent(summary)) return { sent: 0, skipped: true };
  // YouTube: el aviso se guarda hasta 1 año y sus datos de la API solo pueden guardarse 30 días y deben borrarse al
  // revocar (Developer Policies III.E.4.c y III.D.2). Se guarda solo el id de la cuenta; el nombre del canal y los
  // suscriptores se leen al abrir el aviso (src/app/app/(shell)/notifications/[id]/page.tsx).
  const stored = stripYouTubeData(summary);
  const { data: members } = await db.from("workspace_members").select("user_id").eq("workspace_id", project.workspace_id);
  let sent = 0;
  for (const m of members ?? []) {
    const id = crypto.randomUUID();
    sent += await notifyUsers(
      db,
      [m.user_id],
      {
        id,
        workspaceId: project.workspace_id,
        projectId: project.id,
        type: "weekly_summary",
        link: `/app/notifications/${id}`,
        data: stored as unknown as Record<string, Json>,
        dedupeKey: `weekly:${project.id}:${summary.period.from}`,
      },
      (l) =>
        composeText(
          "weekly_summary",
          { project: project.name.slice(0, 80), published: summary.posts.published, failed: summary.posts.failed, scheduled: summary.upcoming.count, overdue: summary.overdueTasks.count },
          l,
        ),
    );
  }
  return { sent, skipped: false };
}
